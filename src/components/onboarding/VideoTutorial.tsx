"use client";

import { useState } from "react";

type Props = {
  /** R2 or external video URL (.mp4 / .webm). */
  src: string;
  /** Optional poster image URL shown before play. */
  poster?: string;
  /** Accessible label for the video. */
  title: string;
  /** Optional caption below the video. */
  caption?: string;
};

export default function VideoTutorial({
  src,
  title,
  poster,
  caption,
}: Props) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="mt-4 overflow-hidden rounded-xl border-2 border-navy-100 bg-navy-950">
      {!playing ? (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group relative flex w-full items-center justify-center"
          style={{ aspectRatio: "16/9" }}
          aria-label={`Play video: ${title}`}
        >
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={poster}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-navy-800 to-navy-950" />
          )}
          <div className="relative flex flex-col items-center gap-3">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-110">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                className="ml-1 text-navy-900"
              >
                <path
                  d="M8 5v14l11-7L8 5z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <span className="rounded-lg bg-black/50 px-3 py-1 text-xs font-semibold text-white">
              {title}
            </span>
          </div>
        </button>
      ) : (
        <video
          src={src}
          controls
          autoPlay
          playsInline
          className="w-full"
          style={{ aspectRatio: "16/9" }}
          title={title}
        >
          Your browser doesn&apos;t support video playback.
        </video>
      )}
      {caption && (
        <p className="bg-navy-950 px-4 py-2 text-xs text-navy-300">
          {caption}
        </p>
      )}
    </div>
  );
}
