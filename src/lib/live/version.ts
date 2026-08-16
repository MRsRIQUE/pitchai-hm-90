/**
 * Versão única do produto — usada no painel, rodapé e página de download.
 * Precisa ficar sempre igual à "version" de extension/manifest.json: é ela
 * que aparece para o usuário e que vira o parâmetro `?v=` do ZIP de download,
 * então se ficar desatualizada aqui o site parece estar "na versão antiga"
 * mesmo depois de a extensão já ter sido corrigida.
 */
export const APP_VERSION = "0.16.6";
