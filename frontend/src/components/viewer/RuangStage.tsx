import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Map as MapIcon, Music2, Pause, Play, VolumeX } from "lucide-react";
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

const iconBtn = "glass inline-flex h-8 w-8 items-center justify-center text-paper transition-colors hover:text-brass md:h-10 md:w-10";

export function RuangStage({ data, maps, tour, index, setIndex, musicOn, setMusicOn }: Props) {
  const scene = tour[index];
  const [playing, setPlaying] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [wake, setWake] = useState(false);
  const [railShown, setRailShown] = useState(true);
  const railTimer = useRef<ReturnType<typeof setTimeout>>();
  const showRail = useCallback(() => {
    setRailShown(true);
    clearTimeout(railTimer.current);
    railTimer.current = setTimeout(() => setRailShown(false), 3500);
  }, []);

  useEffect(() => {
    showRail();
    return () => {
      clearTimeout(railTimer.current);
    };
  }, [index, showRail]);
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

  useEffect(() => {
    const wl = (navigator as any).wakeLock;
    if (!playing || !wl) {
      return;
    }
    let lock: any = null;
    let active = true;
    const acquire = async () => {
      try {
        const l = await wl.request("screen");
        if (!active) {
          l.release?.();
          return;
        }
        lock = l;
        setWake(true);
        l.addEventListener?.("release", () => setWake(false));
      } catch {
        setWake(false);
      }
    };
    const onVis = () => {
      if (active && document.visibilityState === "visible") {
        lock?.release?.();
        acquire();
      }
    };
    acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVis);
      lock?.release?.();
      setWake(false);
    };
  }, [playing]);

  const togglePlay = () => {
    const next = !playing;
    setPlaying(next);
    if (data.music_url) setMusicOn(next);
  };

  const [nativeFs, setNativeFs] = useState(false);
  const [pseudoFs, setPseudoFs] = useState(false);
  const [fsPlan, setFsPlan] = useState(true);
  const isFs = nativeFs || pseudoFs;
  useEffect(() => {
    const onFs = () => setNativeFs(!!stageRef.current && document.fullscreenElement === stageRef.current);
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPseudoFs(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("keydown", onEsc);
    };
  }, []);

  const toggleFs = () => {
    if (document.fullscreenElement) return void document.exitFullscreen();
    if (pseudoFs) return setPseudoFs(false);
    const el = stageRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => setPseudoFs(true));
    else setPseudoFs(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ruang-view" data-wakelock={wake ? "on" : "off"}>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div
          ref={stageRef}
          className={`relative h-[var(--stage-h)] shrink-0 overflow-hidden bg-ink transition-[height] duration-500 md:h-auto md:flex-1 short:h-auto short:flex-1 ${pseudoFs ? "!fixed !inset-0 !z-[100] !h-[100dvh]" : ""}`}
          style={{ "--stage-h": `min(62vh, max(48vh, calc(100vh - 360px)), calc((100vw - 16px) / ${scene.aspect || 1.5} + 52px))` } as React.CSSProperties}
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
            touchX.current = null;
          }}
          onClick={() => (railShown ? setRailShown(false) : showRail())}
          data-testid="ruang-stage"
        >
          <img src={img(scene.thumb_url)} alt="" className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-55 blur-3xl transition-opacity duration-700" />
          <div className="absolute inset-0 bg-ink/35" />
          <div onClick={(e) => e.stopPropagation()} className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-3 py-2 md:items-start md:gap-4 md:px-8 md:py-5 short:py-2" data-testid="scene-topline">
            <p className="eyebrow min-w-0 truncate text-[9.5px] tracking-[0.2em] text-paper/80 md:text-[10.5px] md:tracking-[0.28em]">
              <span className="hidden sm:inline">{floor?.name} <span className="text-brass">/</span> </span>{room?.name}
              {scene.area && scene.area !== room?.name ? <span className="text-paper/50"> · {scene.area}</span> : null}
            </p>
            <div className="flex shrink-0 gap-1.5 md:gap-2">
              {data.music_url && (
                <button onClick={() => setMusicOn((m) => !m)} className={`${iconBtn} ${musicOn ? "text-brass" : ""}`} title={`${musicOn ? "Matikan musik" : "Putar musik"}${data.music_title ? ` — ${data.music_title}` : ""}`} data-testid="music-toggle-btn">
                  {musicOn ? <Music2 size={15} /> : <VolumeX size={15} />}
                </button>
              )}
              <button onClick={togglePlay} className={iconBtn} title={playing ? "Jeda" : "Putar tur"} data-testid="autoplay-toggle-btn">
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button onClick={toggleFs} className={iconBtn} title={isFs ? "Keluar layar penuh" : "Layar penuh"} data-testid="fullscreen-btn" data-fs={isFs ? "on" : "off"}>
                {isFs ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
              {isFs && floor?.plan_url ? (
                <button onClick={() => setFsPlan((v) => !v)} className={`${iconBtn} ${fsPlan ? "text-brass" : ""}`} title={fsPlan ? "Sembunyikan denah" : "Tampilkan denah"} data-testid="fs-plan-toggle-btn">
                  <MapIcon size={15} />
                </button>
              ) : (
                <button onClick={() => setSheet(true)} className={`${iconBtn} md:hidden short:hidden`} title="Denah" data-testid="mobile-denah-btn">
                  <MapIcon size={15} />
                </button>
              )}
            </div>
          </div>
          <div className="absolute inset-0 px-2 pb-1 pt-12 md:px-16 md:pb-6 md:pt-[72px] short:px-14 short:pb-1.5 short:pt-1.5">
            <div className="relative h-full w-full">
              <StageImage scene={scene} valid={valid} onGo={goTo} />
            </div>
          </div>
          {isFs && fsPlan && floor?.plan_url && (
            <div onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()} className="glass fade-up absolute right-2 top-12 z-30 w-[38vw] max-w-[300px] p-2 md:right-[84px] md:top-[72px] md:w-[22vw] short:right-[72px] short:top-12 short:w-[17vw] short:max-w-[140px] short:p-1.5" data-testid="fs-mini-plan">
              <p className="eyebrow mb-1.5 truncate text-[8.5px] text-paper/60 short:mb-1 short:text-[7.5px]">{floor.name}</p>
              <PlanView floor={floor} scenes={floorScenes} activeId={scene.id} compact tiny numbers={maps.number} onSelect={goTo} />
            </div>
          )}
          <button onClick={(e) => { e.stopPropagation(); go(-1); }} className={`${iconBtn} absolute left-2 top-1/2 z-20 -translate-y-1/2 md:left-6 md:h-12 md:w-12`} data-testid="prev-scene-btn">
            <ChevronLeft size={18} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); go(1); }} className={`${iconBtn} absolute right-2 top-1/2 z-20 -translate-y-1/2 md:right-6 md:h-12 md:w-12`} data-testid="next-scene-btn">
            <ChevronRight size={18} />
          </button>
          <div
            className={`absolute inset-x-0 bottom-0 z-30 transition-[opacity,transform] duration-300 md:hidden short:block ${railShown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              e.stopPropagation();
              showRail();
            }}
            onTouchEnd={(e) => e.stopPropagation()}
            onScrollCapture={showRail}
            data-testid="thumb-rail-overlay-wrap"
            data-shown={railShown ? "true" : "false"}
          >
            <ThumbRail tour={tour} index={index} playing={playing} onSelect={(i) => setIndex(i)} overlay />
          </div>
          {!railShown && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                showRail();
              }}
              className="absolute bottom-1 left-1/2 z-30 -translate-x-1/2 px-6 py-2 md:hidden short:block"
              aria-label="Tampilkan semua scene"
              data-testid="show-rail-handle"
            >
              <span className="block h-1 w-10 rounded-full bg-white/45" />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); setSheet(true); }} className={`glass eyebrow absolute bottom-3 right-3 z-20 hidden items-center gap-2 px-4 py-2.5 text-paper transition-opacity short:inline-flex ${railShown ? "pointer-events-none opacity-0" : "opacity-100"}`} data-testid="landscape-denah-btn">
            <MapIcon size={13} /> Denah
          </button>
          <div key={`o-${scene.id}`} className={`glass absolute bottom-3 left-3 z-20 hidden max-w-[45%] px-3 py-2 transition-opacity short:block ${railShown ? "pointer-events-none opacity-0" : "opacity-100"}`} data-testid="landscape-story-overlay">
            <p className="eyebrow text-[9px] text-brass">{pad(index + 1)} / {pad(tour.length)}</p>
            <p className="truncate text-sm">{scene.title || "Tanpa judul"}</p>
            {musicOn && data.music_title && <p className="truncate text-[9px] text-paper/50" data-testid="music-credit-landscape">♪ {data.music_title}</p>}
          </div>
        </div>

        <aside className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5 md:w-[380px] md:flex-none md:border-l md:border-paper/10 md:px-8 md:py-10 short:hidden" data-testid="story-panel">
          <div key={scene.id} className="fade-up">
            <p className="eyebrow text-brass" data-testid="story-number">
              {pad(index + 1)} <span className="text-paper/35">/ {pad(tour.length)}</span>
            </p>
            <h2 className="display mt-2 text-xl leading-snug md:mt-4 md:text-[28px]" data-testid="story-title">{scene.title || "Tanpa judul"}</h2>
            {scene.description && <p className="mt-4 hidden whitespace-pre-line text-sm leading-relaxed text-paper/65 md:block" data-testid="story-description">{scene.description}</p>}
          </div>
          {musicOn && data.music_title && (
            <p className="eyebrow mt-6 text-[9px] text-paper/45" data-testid="music-credit">Musik: {data.music_title}</p>
          )}
          {floor?.plan_url && (
            <div className="mt-auto pt-6 md:pt-10" data-testid="mini-plan">
              <div className="mb-2 flex items-center justify-between gap-3 md:mb-3">
                <p className="eyebrow text-paper/45">{floor.name}</p>
                <button onClick={() => setSheet(true)} className="eyebrow text-[9px] text-brass md:hidden" data-testid="mini-plan-expand-btn">Perbesar</button>
              </div>
              <div className="w-full max-w-[420px] md:max-w-none">
                <PlanView floor={floor} scenes={floorScenes} activeId={scene.id} compact numbers={maps.number} onSelect={goTo} />
              </div>
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
