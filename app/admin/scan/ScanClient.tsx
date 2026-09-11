"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

type Result = {
  success: boolean;
  message: string;

  reservation?: {
    id: string;
    firstname: string;
    lastname: string;

    quantity: number;
    checkedInQuantity: number;
    remainingEntries: number;

    eventName: string;
    clubName: string;

    checkedIn: boolean;
    checkedInAt: string | null;
  };
};

export default function ScanClient() {
  const [code, setCode] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [result, setResult] =
    useState<Result | null>(null);

  const [
    cameraActive,
    setCameraActive,
  ] = useState(false);

  const [
    cameraError,
    setCameraError,
  ] = useState("");

  const scannerRef =
    useRef<any>(null);

  const processingRef =
    useRef(false);

  /*
  |--------------------------------------------------------------------------
  | Vérification du pass
  |--------------------------------------------------------------------------
  */

  async function verifyCode(
    scannedCode: string
  ) {
    const cleanCode =
      scannedCode.trim();

    if (!cleanCode) {
      return;
    }

    /*
     * Évite plusieurs appels simultanés
     * si la caméra lit plusieurs frames.
     */
    if (processingRef.current) {
      return;
    }

    processingRef.current = true;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        "/api/admin/check-in",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            code: cleanCode,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setResult({
          success: false,

          message:
            data.error ||
            "Impossible de vérifier le pass.",
        });

        return;
      }

      setResult({
        success:
          Boolean(data.success),

        message:
          data.message,

        reservation:
          data.reservation,
      });
    } catch (error) {
      console.error(
        "Erreur vérification QR :",
        error
      );

      setResult({
        success: false,

        message:
          "Une erreur est survenue pendant la vérification.",
      });
    } finally {
      setLoading(false);

      processingRef.current =
        false;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Saisie manuelle
  |--------------------------------------------------------------------------
  */

  async function handleSubmit(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    await verifyCode(code);
  }

  /*
  |--------------------------------------------------------------------------
  | Démarrer caméra
  |--------------------------------------------------------------------------
  */

  async function startCamera() {
    setCameraError("");
    setResult(null);

    if (scannerRef.current) {
      return;
    }

    try {
      const {
        Html5Qrcode,
      } = await import(
        "html5-qrcode"
      );

      const scanner =
        new Html5Qrcode(
          "qr-reader"
        );

      scannerRef.current =
        scanner;

      setCameraActive(true);

      await scanner.start(
        {
          facingMode:
            "environment",
        },

        {
          fps: 10,

          qrbox: {
            width: 250,
            height: 250,
          },

          aspectRatio: 1,
        },

        async (
          decodedText: string
        ) => {
          if (
            processingRef.current
          ) {
            return;
          }

          let reservationCode =
            decodedText;

          /*
           * Le QR VIP Share contient :
           *
           * {
           *   type: "vip-share-reservation",
           *   code: "VIP-..."
           * }
           */
          try {
            const parsed =
              JSON.parse(
                decodedText
              );

            if (
              parsed &&
              parsed.type ===
                "vip-share-reservation" &&
              typeof parsed.code ===
                "string"
            ) {
              reservationCode =
                parsed.code;
            }
          } catch {
            /*
             * Si le QR contient simplement
             * "VIP-XXXX", on utilise directement
             * sa valeur.
             */
          }

          reservationCode =
            reservationCode.trim();

          setCode(
            reservationCode
          );

          /*
           * On arrête la caméra avant
           * d'envoyer la validation.
           */
          await stopCamera();

          await verifyCode(
            reservationCode
          );
        },

        () => {
          /*
           * html5-qrcode appelle ce callback
           * en permanence quand il ne détecte
           * rien.
           *
           * Ce n'est pas une vraie erreur.
           */
        }
      );
    } catch (error) {
      console.error(
        "Erreur caméra QR :",
        error
      );

      scannerRef.current =
        null;

      setCameraActive(false);

      setCameraError(
        "Impossible d'accéder à la caméra. Vérifie les permissions du navigateur."
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Arrêter caméra
  |--------------------------------------------------------------------------
  */

  async function stopCamera() {
    const scanner =
      scannerRef.current;

    if (!scanner) {
      setCameraActive(false);
      return;
    }

    /*
     * On retire tout de suite la référence
     * pour éviter les doubles stop().
     */
    scannerRef.current =
      null;

    try {
      const state =
        scanner.getState?.();

      /*
       * html5-qrcode :
       * 2 = SCANNING
       * 3 = PAUSED
       */
      if (
        state === 2 ||
        state === 3
      ) {
        await scanner.stop();
      }
    } catch (error) {
      console.warn(
        "Scanner déjà arrêté :",
        error
      );
    }

    try {
      scanner.clear();
    } catch {
      // Rien à faire.
    }

    setCameraActive(false);
  }

  /*
  |--------------------------------------------------------------------------
  | Scanner suivant
  |--------------------------------------------------------------------------
  */

  async function resetScanner() {
    await stopCamera();

    setCode("");
    setResult(null);
    setCameraError("");

    processingRef.current =
      false;
  }

  /*
  |--------------------------------------------------------------------------
  | Nettoyage quand on quitte la page
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    return () => {
      const scanner =
        scannerRef.current;

      scannerRef.current =
        null;

      if (scanner) {
        try {
          scanner
            .stop()
            .catch(
              () => {}
            );
        } catch {
          // Rien à faire.
        }
      }
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | Interface
  |--------------------------------------------------------------------------
  */

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-xl px-6 py-12">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
            VIP Share · Admin
          </p>

          <h1 className="mt-3 text-4xl font-bold">
            Contrôle d&apos;entrée
          </h1>

          <p className="mt-3 text-zinc-400">
            Scanne le QR code du pass VIP ou
            saisis manuellement le code.
          </p>
        </div>

        {/* Scanner */}

        <section className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                Scanner QR
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Utilise de préférence la caméra
                arrière du téléphone.
              </p>
            </div>

            {cameraActive && (
              <span className="rounded-full border border-green-900 bg-green-950/30 px-3 py-1 text-xs font-medium text-green-400">
                Caméra active
              </span>
            )}
          </div>

          <div
            id="qr-reader"
            className="mt-5 overflow-hidden rounded-2xl bg-black"
          />

          {!cameraActive ? (
            <button
              type="button"
              onClick={
                startCamera
              }
              disabled={
                loading
              }
              className="mt-5 w-full rounded-full bg-white py-4 font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ouvrir la caméra
            </button>
          ) : (
            <button
              type="button"
              onClick={
                stopCamera
              }
              className="mt-5 w-full rounded-full border border-zinc-700 py-4 font-semibold transition hover:border-white"
            >
              Arrêter la caméra
            </button>
          )}

          {cameraError && (
            <div className="mt-4 rounded-2xl border border-red-900 bg-red-950/20 p-4">
              <p className="text-sm text-red-400">
                {cameraError}
              </p>
            </div>
          )}
        </section>

        {/* Séparateur */}

        <div className="my-8 flex items-center gap-4">
          <div className="h-px flex-1 bg-zinc-800" />

          <span className="text-xs uppercase tracking-[0.2em] text-zinc-600">
            ou
          </span>

          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        {/* Entrée manuelle */}

        <form
          onSubmit={
            handleSubmit
          }
          className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6"
        >
          <label
            htmlFor="reservation-code"
            className="block text-sm text-zinc-400"
          >
            Code réservation
          </label>

          <input
            id="reservation-code"
            value={code}
            onChange={(e) =>
              setCode(
                e.target.value
                  .trimStart()
                  .toUpperCase()
              )
            }
            placeholder="VIP-..."
            autoComplete="off"
            className="mt-3 w-full rounded-xl border border-zinc-800 bg-black px-4 py-4 text-lg uppercase outline-none transition focus:border-white"
          />

          <button
            type="submit"
            disabled={
              loading ||
              !code.trim()
            }
            className="mt-5 w-full rounded-full bg-white py-4 font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Vérification..."
              : "Vérifier le pass"}
          </button>
        </form>

        {/* Loading */}

        {loading && (
          <div className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-7 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />

            <p className="mt-4 text-sm text-zinc-400">
              Vérification du pass...
            </p>
          </div>
        )}

        {/* Résultat */}

        {!loading && result && (
          <section
            className={`mt-6 rounded-3xl border p-7 ${
              result.success
                ? "border-green-900 bg-green-950/20"
                : "border-red-900 bg-red-950/20"
            }`}
          >
            <div className="text-center">
              <div
                className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border text-3xl ${
                  result.success
                    ? "border-green-800 bg-green-950 text-green-400"
                    : "border-red-800 bg-red-950 text-red-400"
                }`}
              >
                {result.success
                  ? "✓"
                  : "×"}
              </div>

              <p
                className={`mt-5 text-sm font-semibold uppercase tracking-[0.25em] ${
                  result.success
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {result.success
                  ? "PASS VALIDE"
                  : "PASS REFUSÉ"}
              </p>

              <h2 className="mt-3 text-2xl font-bold">
                {result.message}
              </h2>
            </div>

            {result.reservation && (
              <>
                <div className="mt-7 rounded-2xl border border-white/10 bg-black p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">
                    Réservation
                  </p>

                  <p className="mt-3 text-2xl font-semibold">
                    {
                      result
                        .reservation
                        .firstname
                    }{" "}
                    {
                      result
                        .reservation
                        .lastname
                    }
                  </p>

                  <div className="mt-5 space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-zinc-500">
                        Club
                      </span>

                      <span className="text-right text-white">
                        {
                          result
                            .reservation
                            .clubName
                        }
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-zinc-500">
                        Soirée
                      </span>

                      <span className="text-right text-white">
                        {
                          result
                            .reservation
                            .eventName
                        }
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-zinc-500">
                        Places achetées
                      </span>

                      <span className="text-white">
                        {
                          result
                            .reservation
                            .quantity
                        }
                      </span>
                    </div>
                  </div>
                </div>

                {/* Compteur d'entrées */}

                <div className="mt-4 rounded-2xl border border-zinc-800 bg-black p-5">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-sm text-zinc-500">
                        Entrées utilisées
                      </p>

                      <p className="mt-2 text-4xl font-bold">
                        {
                          result
                            .reservation
                            .checkedInQuantity
                        }
                        <span className="text-zinc-600">
                          {" "}
                          /{" "}
                          {
                            result
                              .reservation
                              .quantity
                          }
                        </span>
                      </p>
                    </div>

                    <p className="text-sm text-zinc-400">
                      {
                        result
                          .reservation
                          .remainingEntries
                      }{" "}
                      restante
                      {result
                        .reservation
                        .remainingEntries >
                      1
                        ? "s"
                        : ""}
                    </p>
                  </div>

                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-white transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (result
                              .reservation
                              .checkedInQuantity /
                              Math.max(
                                result
                                  .reservation
                                  .quantity,
                                1
                              )) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={
                resetScanner
              }
              className="mt-6 w-full rounded-full border border-zinc-700 py-4 text-sm font-semibold transition hover:border-white"
            >
              Scanner un autre pass
            </button>
          </section>
        )}
      </div>
    </main>
  );
}