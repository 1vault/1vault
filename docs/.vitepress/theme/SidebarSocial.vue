<script setup lang="ts">
import { useData } from "vitepress";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

type SidebarLinks = {
  x?: string;
  whitepaper?: string;
  telegram?: string;
};

const { theme } = useData();
const root = ref<HTMLElement | null>(null);

const links = computed(() => {
  const t = theme.value as { sidebarLinks?: SidebarLinks };
  return {
    x: t.sidebarLinks?.x || "https://x.com/1vaults",
    whitepaper: t.sidebarLinks?.whitepaper || "#",
    telegram: t.sidebarLinks?.telegram || "#",
  };
});

function isLive(href: string) {
  return Boolean(href && href !== "#");
}

onMounted(() => {
  const el = root.value;
  if (!el) return;
  const sidebar = el.closest(".VPSidebar");
  if (sidebar && el.parentElement !== sidebar) {
    sidebar.appendChild(el);
  }
});

onBeforeUnmount(() => {
  root.value?.remove();
});
</script>

<template>
  <div ref="root" class="sidebar-social" aria-label="Community links">
    <a
      class="sidebar-social__btn"
      :href="links.x"
      :target="isLive(links.x) ? '_blank' : undefined"
      :rel="isLive(links.x) ? 'noopener noreferrer' : undefined"
      :aria-disabled="!isLive(links.x) ? 'true' : undefined"
    >
      <span class="sidebar-social__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path
            d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.894L1.5 2.25h7.09l4.261 5.688L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"
          />
        </svg>
      </span>
      <span class="sidebar-social__label">twitter</span>
    </a>

    <a
      class="sidebar-social__btn"
      :href="links.whitepaper"
      :target="isLive(links.whitepaper) ? '_blank' : undefined"
      :rel="isLive(links.whitepaper) ? 'noopener noreferrer' : undefined"
      :aria-disabled="!isLive(links.whitepaper) ? 'true' : undefined"
    >
      <span class="sidebar-social__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6M9 17h6" />
        </svg>
      </span>
      <span class="sidebar-social__label">Whitepaper</span>
    </a>

    <a
      class="sidebar-social__btn"
      :href="links.telegram"
      :target="isLive(links.telegram) ? '_blank' : undefined"
      :rel="isLive(links.telegram) ? 'noopener noreferrer' : undefined"
      :aria-disabled="!isLive(links.telegram) ? 'true' : undefined"
    >
      <span class="sidebar-social__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path
            d="M21.8 4.2 3.7 11.2c-1.2.5-1.2 1.2-.2 1.5l4.6 1.4 1.8 5.5c.2.7.4.9 1 .9.6 0 .8-.3 1.1-.6l2.5-2.4 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.5z"
          />
        </svg>
      </span>
      <span class="sidebar-social__label">Telegram</span>
    </a>
  </div>
</template>
