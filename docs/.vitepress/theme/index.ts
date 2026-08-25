import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import "./custom.css";
import SidebarSocial from "./SidebarSocial.vue";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "sidebar-nav-after": () => h(SidebarSocial),
    });
  },
};
