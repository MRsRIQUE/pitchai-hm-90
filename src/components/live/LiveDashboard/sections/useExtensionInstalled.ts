import { useSyncExternalStore } from "react";

/**
 * Detecção da extensão do navegador, com um vigia só para o app inteiro.
 *
 * A extensão anuncia a presença de dois jeitos: um evento na janela e uma
 * marca no `<html>`. O banner de status e o passo a passo do Início precisam
 * da mesma resposta — antes cada um mantinha o próprio `setInterval` de 1,5s e
 * eles podiam discordar por alguns segundos. Aqui o intervalo é único, começa
 * no primeiro assinante e morre assim que a extensão aparece.
 */

function detectar(): boolean {
  if (typeof window === "undefined") return false;
  return (
    Boolean((window as { pitchAiExtensionInstalled?: boolean }).pitchAiExtensionInstalled) ||
    Boolean(document.documentElement.getAttribute("data-pitchai-extension"))
  );
}

let instalada = detectar();
const ouvintes = new Set<() => void>();
let timer: number | null = null;

function marcarInstalada() {
  if (instalada) return;
  instalada = true;
  pararVigia();
  ouvintes.forEach((notificar) => notificar());
}

function verificar() {
  if (detectar()) marcarInstalada();
}

function pararVigia() {
  if (timer === null) return;
  window.clearInterval(timer);
  window.removeEventListener("pitchai-extension-detected", marcarInstalada);
  timer = null;
}

function subscribe(notificar: () => void) {
  ouvintes.add(notificar);

  if (!instalada && timer === null) {
    window.addEventListener("pitchai-extension-detected", marcarInstalada);
    timer = window.setInterval(verificar, 1500);
  }

  return () => {
    ouvintes.delete(notificar);
    if (ouvintes.size === 0) pararVigia();
  };
}

const getSnapshot = () => instalada;
// No servidor não existe `window`; a extensão é sempre "ausente" na primeira pintura.
const getServerSnapshot = () => false;

export function useExtensionInstalled(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
