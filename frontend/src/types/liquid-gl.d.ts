declare module "liquid-gl" {
  export interface LiquidGLOptions {
    target: string;
    snapshot?: string;
    resolution?: number;
    refraction?: number;
    aberration?: number;
    bevelDepth?: number;
    bevelWidth?: number;
    frost?: number;
    shadow?: boolean;
    specular?: boolean;
    reveal?: "none" | "fade";
    tilt?: boolean;
    tiltFactor?: number;
    tiltEase?: number;
    magnify?: number;
    on?: { init?: (instance: unknown) => void };
  }

  /* Shader uniforms are read from `options` every frame, so mutating them
   * animates a live lens without re-initialising the WebGL context. */
  export interface LiquidGLLens {
    el: HTMLElement;
    options: LiquidGLOptions;
  }

  /* Returns a lens, an array of lenses, or - when WebGL is missing - the raw
   * target elements it applied the CSS fallback to. Narrow before use. */
  const liquidGL: (options: LiquidGLOptions) => unknown;

  export default liquidGL;
}
