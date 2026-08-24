import { ImageResponse } from "next/og";
import { verifyPassToken } from "@/lib/server/passToken";

const WIDTH = 1200;
const HEIGHT = 675;

const ACCENT = "#3aa8f0";
const ACCENT_BRIGHT = "#7fe4ff";

/**
 * Google Fonts only serves woff2, which Satori cannot parse, so the display
 * face comes from Fontsource as plain woff. Resolved once per server process;
 * a failure just falls back to the built-in font.
 */
const FONT_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/space-grotesk@5/files/space-grotesk-latin-600-normal.woff";

let fontCache: Promise<ArrayBuffer | null> | null = null;

function loadDisplayFont(): Promise<ArrayBuffer | null> {
  fontCache ??= (async () => {
    try {
      const res = await fetch(FONT_URL);
      return res.ok ? await res.arrayBuffer() : null;
    } catch {
      return null;
    }
  })();

  return fontCache;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  if (!token) {
    return new Response("Missing pass token", { status: 400 });
  }

  const pass = await verifyPassToken(token);
  if (!pass) {
    return new Response("Invalid or expired pass token", { status: 401 });
  }

  const display = await loadDisplayFont();

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: "#04060a",
          color: "#ffffff",
          fontFamily: display ? "Space Grotesk" : "sans-serif",
          overflow: "hidden",
        }}
      >
        {/* Dome rising from the bottom edge, mirroring the site hero. All three
            layers share the centre point (600, 1000) so they stay concentric. */}
        <div
          style={{
            position: "absolute",
            top: 340,
            left: -60,
            width: 1320,
            height: 1320,
            borderRadius: 1320,
            backgroundImage:
              "radial-gradient(circle at center, rgba(58,168,240,0.5) 0%, rgba(11,95,158,0.2) 42%, rgba(4,6,10,0) 68%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 540,
            left: 140,
            width: 920,
            height: 920,
            borderRadius: 920,
            border: `2px solid ${ACCENT}`,
            opacity: 0.3,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 700,
            left: 300,
            width: 600,
            height: 600,
            borderRadius: 600,
            border: `2px solid ${ACCENT_BRIGHT}`,
            opacity: 0.15,
            display: "flex",
          }}
        />

        {/* Inner hairline frame */}
        <div
          style={{
            position: "absolute",
            top: 26,
            left: 26,
            right: 26,
            bottom: 26,
            border: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
          }}
        />

        {/* Header */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "62px 72px 0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                display: "flex",
                width: 13,
                height: 13,
                borderRadius: 13,
                backgroundColor: ACCENT,
              }}
            />
            <div style={{ display: "flex", fontSize: 28, letterSpacing: -0.5 }}>
              1Vault
            </div>
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 18,
              letterSpacing: 6,
              color: "rgba(255,255,255,0.4)",
            }}
          >
            MAINNET WAITLIST
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 72px",
            gap: 56,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 64,
                letterSpacing: -1.5,
                lineHeight: 1.06,
              }}
            >
              EARLY
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 64,
                letterSpacing: -1.5,
                lineHeight: 1.06,
                color: ACCENT_BRIGHT,
              }}
            >
              ACCESS PASS
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 34,
                width: 76,
                height: 2,
                backgroundColor: ACCENT,
              }}
            />

            <div
              style={{
                display: "flex",
                marginTop: 26,
                fontSize: 32,
                letterSpacing: -0.5,
              }}
            >
              {pass.name.slice(0, 26)}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 6,
                fontSize: 23,
                color: "rgba(255,255,255,0.5)",
              }}
            >
              @{pass.handle}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              padding: 9,
              borderRadius: 300,
              border: `3px solid ${ACCENT}`,
            }}
          >
            {pass.avatar ? (
              <img
                src={pass.avatar}
                width={216}
                height={216}
                style={{ borderRadius: 216 }}
                alt=""
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  width: 216,
                  height: 216,
                  borderRadius: 216,
                  backgroundColor: "rgba(255,255,255,0.08)",
                }}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255,255,255,0.12)",
            margin: "0 72px",
            padding: "30px 0 60px",
            fontSize: 18,
            letterSpacing: 5,
            color: "rgba(255,255,255,0.4)",
          }}
        >
          <div style={{ display: "flex" }}>ONE VAULT · ONE BOOK</div>
          <div style={{ display: "flex", color: "rgba(255,255,255,0.7)" }}>
            1VAULTS.XYZ
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        "Cache-Control": "public, max-age=300, immutable",
      },
      fonts: display
        ? [
            {
              name: "Space Grotesk",
              data: display,
              weight: 600,
              style: "normal",
            },
          ]
        : undefined,
    },
  );
}
