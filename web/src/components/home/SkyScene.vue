<script setup lang="ts">
/** Decorative Victoria-Island-style backdrop: sky, drifting clouds, rolling hills. Original artwork. */
</script>

<template>
  <div class="scene" aria-hidden="true">
    <svg class="defs" width="0" height="0" focusable="false">
      <defs>
        <symbol id="cloud" viewBox="0 0 220 100">
          <g fill="#dff1fd"><ellipse cx="110" cy="80" rx="100" ry="16" /></g>
          <g fill="#fff">
            <circle cx="58" cy="62" r="28" /><circle cx="96" cy="44" r="36" /><circle cx="140" cy="52" r="30" />
            <circle cx="172" cy="66" r="22" /><rect x="40" y="62" width="150" height="26" rx="13" />
          </g>
        </symbol>
      </defs>
    </svg>

    <div class="sun" />
    <svg class="cloud c1"><use href="#cloud" /></svg>
    <svg class="cloud c2"><use href="#cloud" /></svg>
    <svg class="cloud c3"><use href="#cloud" /></svg>

    <svg class="hills" viewBox="0 0 1440 300" preserveAspectRatio="none">
      <path d="M0 150C180 70 340 70 520 130S900 200 1100 120s240-50 340-10V300H0z" fill="#86d957" />
      <path d="M0 210C220 140 420 150 640 200s460 40 800-30V300H0z" fill="#4fb83a" />
      <path d="M0 210C220 140 420 150 640 200s460 40 800-30" fill="none" stroke="#8fe35f" stroke-width="6" />
      <rect x="0" y="262" width="1440" height="38" fill="#8a5a2b" />
      <rect x="0" y="262" width="1440" height="7" fill="#3f9e2e" />
    </svg>
  </div>
</template>

<style scoped>
.scene {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background: linear-gradient(180deg, #4fb2f0 0%, #8fd2fa 48%, #d7f0ff 100%);
}
.defs { position: absolute; }
.sun {
  position: absolute;
  top: 5vh;
  right: 8vw;
  width: clamp(70px, 10vw, 130px);
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 38%, #fffbd0, #ffe156 62%, #ffc21f);
  box-shadow: 0 0 0 10px rgba(255, 238, 140, 0.35), 0 0 0 26px rgba(255, 238, 140, 0.18);
}
.cloud { position: absolute; width: clamp(150px, 20vw, 260px); height: auto; aspect-ratio: 2.2; animation: drift linear infinite; }
.c1 { top: 8vh; left: -280px; animation-duration: 120s; }
.c2 { top: 22vh; left: -280px; animation-duration: 170s; animation-delay: -70s; transform: scale(0.8); }
.c3 { top: 34vh; left: -280px; animation-duration: 210s; animation-delay: -150s; transform: scale(0.6); }
@keyframes drift { to { translate: calc(100vw + 600px) 0; } }
.hills { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: clamp(150px, 26vh, 300px); }
@media (prefers-reduced-motion: reduce) {
  .cloud { animation: none; }
  .c1 { left: 12vw; }
  .c2 { left: 52vw; }
  .c3 { left: 28vw; }
}
</style>
