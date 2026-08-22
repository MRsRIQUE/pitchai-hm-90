import { useStorage } from "nitro/storage";

/**
 * O pacote fica embutido exclusivamente no bundle do servidor. Mantê-lo fora
 * de `public/` impede que a URL estática contorne a validação de licença.
 */
export async function getExtensionPackage(): Promise<Uint8Array> {
  const raw = await useStorage("assets/extension").getItemRaw("pitchai-extension.zip");
  if (raw == null) throw new Error("Pacote da extensão não encontrado");

  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (typeof raw === "string") return Uint8Array.from(Buffer.from(raw, "binary"));
  throw new Error("Formato inválido do pacote da extensão");
}
