import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Map as MapIcon, Music2, Pause, Play, VolumeX } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { img, pad } from "@/lib/api";
import type { ViewMaps } from "@/lib/viewer";
import type { ViewData, Scene } from "@/types";
import { StageImage } from "@/components/viewer/StageImage";
import { ThumbRail } from "@/components/viewer/ThumbRail";
import { PlanView } from "@/components/viewer/PlanView";
import { AreaList } from "@/components/viewer/AreaList";

interface Props {
  data: ViewData;
  maps: ViewMaps;
  tour: Scene[];
  index: number;
  setIndex: (fn: number | ((i: number) => number)) => void;
  musicOn: boolean;
  setMusicOn: (fn: boolean | ((m: boolean) => boolean)) => void;
}

const iconBtn = "glass inline-flex h-10 w-10 items-center justify-center text-paper transition-colors hover:text-brass";

export function RuangStage({ data, maps, tour, index, setIndex, musicOn, setMusicOn }: Props) {
  const scene = tour[index];
  const [playing, setPlaying] = useState(false);
  const [sheet, setSheet] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const valid = useMemo(() => new Set(tour.map((s) => s.id)), [tour]);
  const floor = maps.floor[scene.floor_id];
  const room = maps.room[scene.room_id];
  const floorScenes = tour.filter((s) => s.floor_id === scene.floor_id);
  const floorRooms = data.rooms.filter((r) => r.floor_id === scene.floor_id);

  const go = useCallback((d: number) => setIndex((i) => (i + d + tour.length) % tour.length), [setIndex, tour.length]);
  const goTo = (id: string) => {
    const i = tour.findIndex((s) => s.id === id);
    if (i >= 0) setIndex(i);
  };

  useEffect(() => {
    if (!playing) {
      return;
    }
    const t = setTimeout(() => go(1), 7000);
    return () => {
      clearTimeout(t);
    };
  }, [playing, index, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea,select")) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [go]);

  useEffect(() => {
    const next = tour[(index + 1) % tour.length];
    if (next?.image_url) {
      const im = new Image();
      im.src = img(next.image_url);
    }
  }, [index, tour]);

  const togglePlay = () => {
    const next = !playing;
    setPlaying(next);
    if (data.music_url) setMusicOn(next);
  };

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stageRef.current?.requestFullscreen?.();
  };

  return (
    <div className="flex flex-col md:h-[calc(100dvh-64px)]" data-testid="ruang-view">
      <div className="flex flex-col md:min-h-0 md:flex-1 md:flex-row">
        <div
          ref={stageRef}
          className="relative h-[58vh] shrink-0 overflow-hidden bg-ink md:h-auto md:flex-1"
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
            touchX.current = null;
          }}
          data-testid="ruang-stage"
        >
          <img src={img(scene.thumb_url)} alt="" className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-55 blur-3xl transition-opacity duration-700" />
          <div className="absolute inset-0 bg-ink/35" />
          <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 px-4 py-3 md:px-8 md:py-5" data-testid="scene-topline">
            <p className="eyebrow min-w-0 truncate text-paper/80">
              {floor?.name} <span className="text-brass">/</span> {room?.name}
              {scene.area && scene.area !== room?.name ? <span className="text-paper/50"> · {scene.area}</span> : null}
            </p>
            <div className="flex shrink-0 gap-2">
              {data.music_url && (
                <button onClick={() => setMusicOn((m) => !m)} className={`${iconBtn} ${musicOn ? "text-brass" : ""}`} title={musicOn ? "Matikan musik" : "Putar musik"} data-testid="music-toggle-btn">
                  {musicOn ? <Music2 size={15} /> : <VolumeX size={15} />}
                </button>
              )}
              <button onClick={togglePlay} className={iconBtn} title={playing ? "Jeda" : "Putar tur"} data-testid="autoplay-toggle-btn">
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button onClick={toggleFs} className={iconBtn} title="Layar penuh" data-testid="fullscreen-btn">
                <Maximize2 size={15} />
              </button>
            </div>
          </div>
          <div className="absolute inset-0 px-2 pb-10 pt-16 md:px-20 md:pb-10 md:pt-20">
            <div className="relative h-full w-full">
              <StageImage scene={scene} valid={valid} onGo={goTo} />
            </div>
          </div>
          <button onClick={() => go(-1)} className={`${iconBtn} absolute left-2 top-1/2 z-20 -translate-y-1/2 md:left-6 md:h-12 md:w-12`} data-testid="prev-scene-btn">
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => go(1)} className={`${iconBtn} absolute right-2 top-1/2 z-20 -translate-y-1/2 md:right-6 md:h-12 md:w-12`} data-testid="next-scene-btn">
            <ChevronRight size={18} />
          </button>
          <button onClick={() => setSheet(true)} className="glass eyebrow absolute bottom-3 right-3 z-20 inline-flex items-center gap-2 px-4 py-2.5 text-paper md:hidden" data-testid="mobile-denah-btn">
            <MapIcon size={13} /> Denah
          </button>
        </div>

        <aside className="px-5 py-7 md:flex md:w-[380px] md:flex-col md:overflow-y-auto md:border-l md:border-paper/10 md:px-8 md:py-10" data-testid="story-panel">
          <div key={scene.id} className="fade-up">
            <p className="eyebrow text-brass" data-testid="story-number">
              {pad(index + 1)} <span className="text-paper/35">/ {pad(tour.length)}</span>
            </p>
            <h2 className="display mt-4 text-2xl leading-snug md:text-[28px]" data-testid="story-title">{scene.title || "Tanpa judul"}</h2>
            {scene.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-paper/65" data-testid="story-description">{scene.description}</p>}
          </div>
          {floor?.plan_url && (
            <div className="mt-auto hidden pt-10 md:block" data-testid="mini-plan">
              <p className="eyebrow mb-3 text-paper/45">{floor.name}</p>
              <PlanView floor={floor} scenes={floorScenes} activeId={scene.id} compact numbers={maps.number} onSelect={goTo} />
            </div>
          )}
        </aside>
      </div>

      <ThumbRail tour={tour} index={index} playing={playing} onSelect={(i) => setIndex(i)} />

      <Drawer open={sheet} onOpenChange={setSheet}>
        <DrawerContent className="max-h-[85vh] border-paper/10 bg-surface text-paper" data-testid="mobile-denah-sheet">
          <DrawerTitle className="eyebrow px-5 pt-4 text-brass">{floor?.name || "Denah"}</DrawerTitle>
          <div className="overflow-y-auto px-5 pb-10 pt-4">
            {floor && <PlanView floor={floor} scenes={floorScenes} activeId={scene.id} numbers={maps.number} onSelect={(id) => { goTo(id); setSheet(false); }} />}
            <div className="mt-8">
              <AreaList rooms={floorRooms} scenes={floorScenes} maps={maps} activeId={scene.id} onSelect={(id) => { goTo(id); setSheet(false); }} />
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
