import type { LiveSessionRow } from "./sync";

export type PerformanceRecommendation = {
  id: string;
  priority: "alta" | "media" | "oportunidade";
  title: string;
  detail: string;
  evidence: string;
};

export type PerformanceAnalysis = {
  sessions: number;
  capturedSessions: number;
  dataCoverage: number;
  orders: number;
  answered: number;
  messagesReceived: number;
  ignored: number;
  blocked: number;
  responseRate: number | null;
  gmv: number | null;
  productClicks: number | null;
  viewersPeak: number | null;
  avgWatchSeconds: number | null;
  visitorPercent: number | null;
  conversionRate: number | null;
  clickRate: number | null;
  averageTicket: number | null;
  durationSeconds: number;
  salesPerHour: number | null;
  productsPitched: number;
  pitchesSpoken: number;
  audienceJoins: number;
  audienceFollows: number;
  violations: number;
  recommendations: PerformanceRecommendation[];
};

const finite = (value: number) => (Number.isFinite(value) ? value : null);

/** Aceita métricas do Gerenciador em pt-BR e formatos compactos como 1,2 mil. */
export function parseLiveNumber(value: unknown): number | null {
  if (typeof value === "number") return finite(value);
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw || raw === "—" || raw === "-") return null;
  const multiplier = /(?:mil|k)\b/.test(raw) ? 1_000 : /(?:mi|m)\b/.test(raw) ? 1_000_000 : 1;
  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma > lastDot) normalized = cleaned.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && lastComma >= 0) normalized = cleaned.replace(/,/g, "");
  else if (/^-?\d{1,3}\.\d{3}$/.test(cleaned)) normalized = cleaned.replace(".", "");
  else if (/^-?\d{1,3},\d{3}$/.test(cleaned)) normalized = cleaned.replace(",", "");
  else if ((cleaned.match(/\./g) || []).length > 1) normalized = cleaned.replace(/\./g, "");
  else if ((cleaned.match(/,/g) || []).length > 1) normalized = cleaned.replace(/,/g, "");
  const parsed = Number(normalized);
  return finite(parsed * multiplier);
}

export function parseLiveDuration(value: unknown): number | null {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  const clock = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (clock) {
    return clock[3]
      ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
      : Number(clock[1]) * 60 + Number(clock[2]);
  }
  const hours = Number(raw.match(/([\d,.]+)\s*h/)?.[1]?.replace(",", ".") || 0);
  const minutes = Number(raw.match(/([\d,.]+)\s*m(?:in)?/)?.[1]?.replace(",", ".") || 0);
  const seconds = Number(raw.match(/([\d,.]+)\s*s/)?.[1]?.replace(",", ".") || 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

const array = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const ratio = (numerator: number, denominator: number) =>
  denominator > 0 ? (numerator / denominator) * 100 : null;

export function analyzeLivePerformance(
  sessions: LiveSessionRow[],
  now = Date.now(),
): PerformanceAnalysis {
  const captured = sessions.filter((session) => Boolean(session.live_metrics?.captured_at));
  const orders = sessions.reduce((sum, session) => sum + array(session.sales_snapshot).length, 0);
  const answered = sessions.reduce(
    (sum, session) => sum + (Number(session.messages_answered) || 0),
    0,
  );
  const messagesReceived = sessions.reduce(
    (sum, session) => sum + (Number(session.messages_received) || 0),
    0,
  );
  const ignored = sessions.reduce(
    (sum, session) => sum + (Number(session.messages_ignored) || 0),
    0,
  );
  const blocked = sessions.reduce(
    (sum, session) => sum + (Number(session.messages_blocked) || 0),
    0,
  );
  const productsPitched = new Set(
    sessions.flatMap((session) =>
      array(session.products_pitched).map((item) => item?.id || item?.name),
    ),
  ).size;
  const violations = sessions.reduce(
    (sum, session) => sum + (Number(session.violation_count) || 0),
    0,
  );
  const pitchesSpoken = sessions.reduce(
    (sum, session) => sum + (Number(session.pitches_spoken) || 0),
    0,
  );
  const audienceJoins = sessions.reduce(
    (sum, session) => sum + (Number(session.audience_joins) || 0),
    0,
  );
  const audienceFollows = sessions.reduce(
    (sum, session) => sum + (Number(session.audience_follows) || 0),
    0,
  );
  const durationSeconds = sessions.reduce((sum, session) => {
    const start = Date.parse(session.started_at);
    const end = session.ended_at ? Date.parse(session.ended_at) : now;
    return (
      sum +
      (Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 1000 : 0)
    );
  }, 0);

  const metricValues = captured.map((session) => session.live_metrics || {});
  const sumMetric = (key: "gmv" | "product_clicks") => {
    const values = metricValues
      .map((metric) => parseLiveNumber(metric[key]))
      .filter((v): v is number => v !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const averageMetric = (key: "visitor_percent") => {
    const values = metricValues
      .map((metric) => parseLiveNumber(metric[key]))
      .filter((v): v is number => v !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const gmv = sumMetric("gmv");
  const productClicks = sumMetric("product_clicks");
  const viewerValues = metricValues
    .map((metric) => parseLiveNumber(metric.viewers))
    .filter((v): v is number => v !== null);
  const watchValues = metricValues
    .map((metric) => parseLiveDuration(metric.avg_watch))
    .filter((v): v is number => v !== null);
  const viewersPeak = viewerValues.length ? Math.max(...viewerValues) : null;
  const avgWatchSeconds = watchValues.length
    ? watchValues.reduce((sum, value) => sum + value, 0) / watchValues.length
    : null;
  const visitorPercent = averageMetric("visitor_percent");
  const totalMessages = messagesReceived || answered + ignored + blocked;
  const responseRate = ratio(answered, totalMessages);
  const conversionRate = productClicks === null ? null : ratio(orders, productClicks);
  const clickRate =
    productClicks === null || viewersPeak === null ? null : ratio(productClicks, viewersPeak);
  const averageTicket = gmv !== null && orders > 0 ? gmv / orders : null;
  const salesPerHour = durationSeconds >= 300 ? orders / (durationSeconds / 3600) : null;
  const coverageFields = [gmv, productClicks, viewersPeak, avgWatchSeconds, visitorPercent];
  const dataCoverage = Math.round(
    ((coverageFields.filter((value) => value !== null).length + (sessions.length ? 2 : 0)) / 7) *
      100,
  );

  const recommendations: PerformanceRecommendation[] = [];
  const add = (...items: PerformanceRecommendation[]) => recommendations.push(...items);
  if (!sessions.length) {
    add({
      id: "start",
      priority: "alta",
      title: "Conecte a extensão durante uma LIVE",
      detail:
        "A análise começa assim que uma sessão real envia atividades e métricas do Gerenciador.",
      evidence: "Nenhuma sessão real encontrada no período.",
    });
  } else if (!captured.length) {
    add({
      id: "capture",
      priority: "alta",
      title: "Mantenha a área Análise visível",
      detail:
        "A extensão registrou a sessão, mas ainda não conseguiu ler as métricas do Gerenciador.",
      evidence: `${sessions.length} sessão(ões), nenhuma leitura de métricas confirmada.`,
    });
  }
  if (totalMessages >= 5 && responseRate !== null && responseRate < 70) {
    add({
      id: "responses",
      priority: "alta",
      title: "Aumente a cobertura do chat",
      detail:
        "Revise o intervalo de respostas e o contexto da IA para aproveitar mais perguntas reais.",
      evidence: `${answered} de ${totalMessages} mensagens tratadas (${Math.round(responseRate)}%).`,
    });
  }
  if (
    productClicks !== null &&
    productClicks >= 10 &&
    conversionRate !== null &&
    conversionRate < 3
  ) {
    add({
      id: "conversion",
      priority: "alta",
      title: "Reforce prova e objeções antes do CTA",
      detail:
        "Há interesse no produto, mas poucos pedidos depois do clique. Use demonstração, prova e resposta a objeções antes de pedir a compra.",
      evidence: `${Math.round(productClicks)} cliques e ${orders} pedidos (${conversionRate.toFixed(1)}% de conversão).`,
    });
  }
  if (viewersPeak !== null && viewersPeak >= 10 && clickRate !== null && clickRate < 10) {
    add({
      id: "clicks",
      priority: "media",
      title: "Mostre melhor onde clicar",
      detail:
        "Repita o benefício principal e convide a abrir o produto fixado em momentos de maior audiência.",
      evidence: `${Math.round(productClicks || 0)} cliques para pico de ${Math.round(viewersPeak)} espectadores.`,
    });
  }
  if (avgWatchSeconds !== null && avgWatchSeconds < 45) {
    add({
      id: "retention",
      priority: "media",
      title: "Fortaleça os primeiros segundos",
      detail:
        "Alterne perguntas curtas, demonstração e promessa concreta para segurar quem acabou de entrar.",
      evidence: `Duração média assistida de ${Math.round(avgWatchSeconds)} segundos.`,
    });
  }
  if (audienceJoins >= 10 && audienceFollows / audienceJoins < 0.05) {
    add({
      id: "follows",
      priority: "media",
      title: "Converta mais entradas em seguidores",
      detail:
        "Faça uma chamada curta para seguir logo após receber novos espectadores, sem interromper o pitch principal.",
      evidence: `${audienceFollows} follow(s) para ${audienceJoins} entrada(s) identificada(s).`,
    });
  }
  if (pitchesSpoken >= 5 && productClicks !== null && productClicks / pitchesSpoken < 1) {
    add({
      id: "pitch-clicks",
      priority: "media",
      title: "Varie o ângulo dos pitches",
      detail:
        "Há muitas apresentações para poucos cliques. Alterne benefício, demonstração, objeção e CTA em vez de repetir a oferta.",
      evidence: `${pitchesSpoken} pitches falados e ${Math.round(productClicks)} clique(s).`,
    });
  }
  if (sessions.length && productsPitched === 0) {
    add({
      id: "products",
      priority: "media",
      title: "Apresente um produto rastreável",
      detail:
        "Fixe um produto e deixe a IA registrá-lo; isso permite relacionar pitch e venda nas próximas análises.",
      evidence: "Nenhum produto apresentado foi registrado no período.",
    });
  }
  if (violations > 0) {
    add({
      id: "safety",
      priority: "alta",
      title: "Revise os alertas de segurança",
      detail: "Confira as falas próximas aos alertas e ajuste termos sensíveis no Cérebro da IA.",
      evidence: `${violations} alerta(s) de violação registrado(s).`,
    });
  }
  if (orders > 0 && conversionRate !== null && conversionRate >= 8) {
    add({
      id: "winning-pattern",
      priority: "oportunidade",
      title: "Repita o padrão que está convertendo",
      detail:
        "Mantenha a sequência de pitch, produto e CTA desta sessão como base para a próxima LIVE.",
      evidence: `${orders} pedidos e ${conversionRate.toFixed(1)}% de conversão após clique.`,
    });
  }
  if (!recommendations.length && sessions.length) {
    add({
      id: "collect",
      priority: "oportunidade",
      title: "Continue coletando dados reais",
      detail:
        "A amostra atual ainda não sustenta uma recomendação específica sem adivinhar resultados.",
      evidence: `${captured.length} de ${sessions.length} sessão(ões) com métricas confirmadas.`,
    });
  }

  return {
    sessions: sessions.length,
    capturedSessions: captured.length,
    dataCoverage,
    orders,
    answered,
    messagesReceived,
    ignored,
    blocked,
    responseRate,
    gmv,
    productClicks,
    viewersPeak,
    avgWatchSeconds,
    visitorPercent,
    conversionRate,
    clickRate,
    averageTicket,
    durationSeconds,
    salesPerHour,
    productsPitched,
    pitchesSpoken,
    audienceJoins,
    audienceFollows,
    violations,
    recommendations: recommendations.slice(0, 5),
  };
}
