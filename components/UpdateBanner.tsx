// components/UpdateBanner.tsx
"use client";
import { useEffect, useState } from "react";

export default function UpdateBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setShowBanner(true);
            }
          });
        });
      });
    }
  }, []);

  const handleReload = () => {
    window.location.reload();
  };

  if (!showBanner) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col">
      {/* Overlay — blocks entire app */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Banner — pinned to bottom */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-r from-red-600 to-red-700 text-white shadow-2xl">
        <div className="max-w-4xl mx-auto px-4 py-4 sm:py-5 flex flex-col sm:flex-row items-center justify-between gap-4">

          {/* Left: Icon + Text */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-lg p-2 flex-shrink-0 flex items-center justify-center">
              <svg
                className="w-6 h-6 sm:w-7 sm:h-7 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg leading-tight">
                New Update Available
              </h3>
              <p className="text-sm sm:text-base font-semibold text-white">
                Weekend Playzz Version 2.0
              </p>
              <p className="text-xs sm:text-sm text-red-100 mt-0.5">
                Please update to continue using the app.
              </p>
            </div>
          </div>

          {/* Right: Reload button */}
          <div className="w-full sm:w-auto flex-shrink-0">
            <button
              onClick={handleReload}
              className="w-full sm:w-auto px-8 py-3 bg-white text-red-600 hover:bg-red-50 rounded-lg font-bold transition-colors shadow-lg text-sm sm:text-base"
            >
              Reload App
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}