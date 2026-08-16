import { Download, ExternalLink } from "lucide-react";

/**
 * Mini tutorial de roteamento de áudio.
 *
 * É o passo que mais trava usuário novo: a voz da IA sai do navegador, mas o
 * TikTok só escuta um microfone. O cabo virtual é a ponte, e cada sistema tem
 * o seu — por isso os três caminhos ficam lado a lado em vez de escondidos num
 * link de ajuda.
 */
export function GuiaTransmissao() {
  return (
    <div className="app-section">
      <div className="app-section-head">
        <h2 className="app-section-title">Como a voz chega na sua live</h2>
      </div>

      <div className="app-card">
        <div className="app-alert" data-tone="info">
          <Download aria-hidden="true" />
          <span>
            O navegador não entrega áudio direto para o TikTok. Instale um cabo virtual: ele aparece
            como microfone para o TikTok Live Studio e para o OBS.
          </span>
        </div>

        <div className="app-toolbar" style={{ marginTop: 14, marginBottom: 0 }}>
          <a
            className="app-btn app-btn--primary"
            href="https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip"
            target="_blank"
            rel="noreferrer"
          >
            <Download aria-hidden="true" />
            VB-Cable (Windows)
          </a>
          <a
            className="app-btn"
            href="https://existential.audio/blackhole/"
            target="_blank"
            rel="noreferrer"
          >
            <Download aria-hidden="true" />
            BlackHole (Mac)
          </a>
        </div>
      </div>

      <div className="app-grid app-grid--2" style={{ marginTop: 16 }}>
        <div className="app-card">
          <div className="app-card-head">
            <h3 className="app-card-title">Windows — VB-Cable</h3>
          </div>
          <ol className="app-field-hint" style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
            <li>
              Baixe pelo botão acima, extraia o ZIP e rode <b>VBCABLE_Setup_x64.exe</b> como
              administrador. Reinicie o PC.
            </li>
            <li>
              Aqui em <b>Saída de áudio</b>, escolha <b>CABLE Input (VB-Audio Virtual Cable)</b>.
            </li>
            <li>
              No TikTok Live Studio, OBS ou no navegador da live, defina o microfone como{" "}
              <b>CABLE Output (VB-Audio Virtual Cable)</b>.
            </li>
            <li>
              Quer misturar sua voz com a da IA? Use o{" "}
              <a
                className="app-link-ext"
                href="https://vb-audio.com/Voicemeeter/"
                target="_blank"
                rel="noreferrer"
              >
                VoiceMeeter Banana
                <ExternalLink aria-hidden="true" />
              </a>
            </li>
          </ol>
        </div>

        <div className="app-card">
          <div className="app-card-head">
            <h3 className="app-card-title">Mac — BlackHole</h3>
          </div>
          <ol className="app-field-hint" style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
            <li>Baixe a versão 2ch pelo botão acima.</li>
            <li>
              Abra <b>Configuração de Áudio MIDI</b> e crie um <b>Dispositivo Agregado</b> com
              BlackHole + suas caixas, para você continuar ouvindo.
            </li>
            <li>
              Aqui em <b>Saída de áudio</b>, escolha <b>BlackHole 2ch</b>.
            </li>
            <li>
              No app da live, selecione o microfone <b>BlackHole 2ch</b>.
            </li>
          </ol>
        </div>
      </div>

      <div className="app-card" style={{ marginTop: 16 }}>
        <div className="app-card-head">
          <h3 className="app-card-title">Celular</h3>
        </div>
        <ul className="app-field-hint" style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
          <li>Não dá para rotear áudio interno para o microfone da câmera nativa sem cabo.</li>
          <li>Caminho simples: transmita do PC e use o celular só como monitor.</li>
          <li>
            Alternativa: cabo <b>TRRS</b> ligando a saída de fone do PC na entrada de microfone do
            celular (com adaptador Lightning ou USB-C, se precisar) + app <b>Larix Broadcaster</b>.
          </li>
        </ul>
      </div>

      <div className="app-card app-card--flat" style={{ marginTop: 16 }}>
        <p className="app-field-hint">
          <b>Para conferir:</b> no TikTok Live Studio, vá em Configurações → Áudio e selecione o
          cabo virtual como microfone. Fale por 5 segundos e veja o VU meter mexer. Depois clique em{" "}
          <b>Testar voz</b> aqui em cima e confirme que ele mexe de novo.
        </p>
      </div>
    </div>
  );
}
