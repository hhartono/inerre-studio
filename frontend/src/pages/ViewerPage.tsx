import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, errMsg, img, pad } from "@/lib/api";
import { buildMaps, tourScenes } from "@/lib/viewer";
import { useMe } from "@/context/MeContext";
import type { ViewData } from "@/types";
import { Splash } from "@/components/RequireRole";
import { Masthead, ViewerTab } from "@/components/viewer/Masthead";
import { RuangStage } from "@/components/viewer/RuangStage";
import { DenahView } from "@/components/viewer/DenahView";
import { PresentationView } from "@/components/viewer/PresentationView";

const hashIndex = () => {
  const m = window.location.hash.match(/scene=(\d+)/);
  return m ? parseInt(m[1], 10) - 1 : 0;
};

export default function ViewerPage({ mode }: { mode: "draft" | "published" }) {
  const { projectId } = useParams();
  const { me } = useMe();
  const [data, setData] = useState<ViewData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ViewerTab>("ruang");
  const [index, setIndexRaw] = useState(0);
  const [musicOn, setMusicOn] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) {
      return;
    }
    a.volume = 0.6;
    if (musicOn) a.play().catch(() => setMusicOn(false));
    else a.pause();
  }, [musicOn]);

  useEffect(() => {
    api
      .get(`/projects/${projectId}/view`, { params: { mode } })
      .then((r) => {
        setData(r.data);
        setIndexRaw(Math.max(0, Math.min(r.data.tour_order.length - 1, hashIndex())));
      })
      .catch((e) => setError(errMsg(e)));
  }, [projectId, mode]);

  const maps = useMemo(() => (data ? buildMaps(data) : null), [data]);
  const tour = useMemo(() => tourScenes(data, maps), [data, maps]);
  const setIndex = setIndexRaw as any;

  useEffect(() => {
    if (tour.length) window.history.replaceState(null, "", `#scene=${pad(index + 1)}`);
  }, [index, tour.length]);

  useEffect(() => {
    const onHash = () => setIndexRaw(Math.max(0, Math.min(tour.length - 1, hashIndex())));
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
    };
  }, [tour.length]);

  const staff = me && ["admin", "designer"].includes(me.role);
  const backTo = mode === "draft" ? `/studio/${projectId}` : staff ? "/studio" : "/projects";

  if (error) {
    return (
      <div className="flex min-h-screen flex-col justify-center bg-ink px-6 md:px-16" data-testid="viewer-error">
        <p className="eyebrow mb-4 text-brass">INERRE</p>
        <p className="text-lg">{error}</p>
        <Link to="/" className="eyebrow mt-8 w-fit border border-paper/20 px-6 py-3 transition-colors hover:border-brass hover:text-brass" data-testid="viewer-error-home-link">Kembali ke beranda</Link>
      </div>
    );
  }
  if (!data || !maps) return <Splash />;

  const openScene = (id: string) => {
    const i = tour.findIndex((s) => s.id === id);
    if (i >= 0) setIndexRaw(i);
    setTab("ruang");
  };

  return (
    <div className={`bg-ink text-paper ${tab === "denah" ? "flex h-[100dvh] flex-col overflow-hidden" : "min-h-screen"}`} data-testid="viewer-page">
      <Masthead data={data} tab={tab} setTab={setTab} backTo={backTo} />
      {tab === "ruang" &&
        (tour.length ? (
          <RuangStage data={data} maps={maps} tour={tour} index={Math.min(index, tour.length - 1)} setIndex={setIndex} musicOn={musicOn} setMusicOn={setMusicOn} />
        ) : (
          <p className="eyebrow px-5 py-16 text-paper/45 md:px-10" data-testid="viewer-empty">Belum ada scene</p>
        ))}
      {tab === "denah" && <DenahView data={data} maps={maps} tour={tour} currentId={tour[index]?.id} onOpen={openScene} />}
      {tab === "pdf" && data.pdf_pages?.length > 0 && <PresentationView pages={data.pdf_pages} />}
      {data.music_url && <audio ref={audioRef} src={img(data.music_url)} loop preload="none" data-testid="tour-music-audio" />}
    </div>
  );
}
