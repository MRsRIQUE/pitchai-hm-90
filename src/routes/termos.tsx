import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso · Pitch AI" },
      {
        name: "description",
        content: "Termos de Uso da plataforma Pitch AI para automação de live commerce.",
      },
    ],
  }),
  component: TermsPage,
});

const sections = [
  {
    title: "1. Aceitação dos termos",
    body: [
      "Ao criar uma conta ou utilizar a Pitch AI, você declara que leu e concorda com estes Termos de Uso. Se não concordar com qualquer parte destes termos, não utilize a plataforma.",
      "A Pitch AI poderá atualizar estes termos para refletir mudanças no produto, na legislação ou nas práticas de segurança. A versão publicada nesta página é a versão vigente.",
    ],
  },
  {
    title: "2. O que a Pitch AI oferece",
    body: [
      "A Pitch AI oferece ferramentas de apoio à automação de live commerce, incluindo recursos de IA, organização de produtos, respostas para o chat, narração e integrações com serviços de terceiros.",
      "Os recursos podem depender de plataformas externas, APIs, extensões, modelos de IA e configurações feitas pelo próprio usuário. A disponibilidade pode variar conforme esses serviços.",
    ],
  },
  {
    title: "3. Responsabilidade pelos produtos e vendas",
    body: [
      "A Pitch AI não vende, fabrica, armazena, envia, intermedeia ou garante qualquer produto apresentado pelo usuário. Toda responsabilidade por produtos, preços, estoque, qualidade, origem, legalidade, entrega, troca, devolução, garantia, publicidade e atendimento ao consumidor é exclusivamente do usuário e/ou do vendedor responsável.",
      "O usuário deve verificar as informações antes de publicá-las e cumprir as regras de defesa do consumidor, publicidade, propriedade intelectual, tributação e comércio aplicáveis à sua atividade.",
      "A Pitch AI não participa da relação comercial entre vendedor e comprador e não é responsável por reclamações, chargebacks, perdas, danos ou disputas relacionadas aos produtos ou às vendas.",
    ],
  },
  {
    title: "4. Avisos, restrições e banimentos",
    body: [
      "A Pitch AI não controla as decisões de TikTok Shop, TikTok, marketplaces, redes sociais, provedores de pagamento, serviços de hospedagem ou outras plataformas de terceiros.",
      "Avisos, remoções, limitações de alcance, suspensões, desativações, bloqueios e banimentos aplicados por terceiros podem ocorrer por motivos definidos por essas plataformas. A Pitch AI não garante que a conta, live, anúncio, produto ou conteúdo do usuário permanecerá disponível.",
      "O usuário é responsável por conhecer e cumprir as políticas das plataformas conectadas. A utilização da Pitch AI não substitui a leitura dessas políticas nem cria qualquer promessa de aprovação ou permanência.",
    ],
  },
  {
    title: "5. Uso permitido e conteúdo",
    body: [
      "Você não poderá utilizar a Pitch AI para fraude, spam, conteúdo ilegal, violação de direitos de terceiros, manipulação enganosa, venda de produtos proibidos ou qualquer atividade que infrinja leis ou políticas de plataformas conectadas.",
      "Você permanece responsável pelos dados, textos, imagens, áudios, produtos e instruções fornecidos à plataforma, bem como pelas respostas e conteúdos publicados com auxílio da IA. Revise o conteúdo antes de colocá-lo no ar.",
    ],
  },
  {
    title: "6. Limitação de responsabilidade",
    body: [
      "Na extensão permitida pela legislação aplicável, a Pitch AI não será responsável por lucros cessantes, perda de vendas, perda de dados, indisponibilidade de plataformas de terceiros, decisões de moderação, banimentos, falhas de integração ou danos decorrentes do uso ou da impossibilidade de uso do serviço.",
      "Nada nestes termos exclui ou limita direitos que não possam ser excluídos ou limitados pela legislação brasileira aplicável. A responsabilidade da Pitch AI, quando legalmente reconhecida, ficará limitada aos danos diretos comprovados e ao valor pago pelo usuário à Pitch AI nos 12 meses anteriores ao evento, salvo disposição legal obrigatória em contrário.",
    ],
  },
  {
    title: "7. Conta, pagamento e encerramento",
    body: [
      "Você deve manter seus dados de acesso corretos e proteger sua senha. A conta é pessoal e as ações realizadas por ela serão atribuídas ao usuário, salvo comprovação de uso indevido comunicado à Pitch AI.",
      "Planos, preços, limites e recursos podem mudar mediante comunicação adequada. O usuário pode cancelar conforme as condições apresentadas no momento da contratação, sem prejuízo de valores já devidos.",
      "A Pitch AI poderá suspender ou encerrar contas que violem estes termos, causem risco à plataforma ou utilizem o serviço de forma ilegal ou abusiva.",
    ],
  },
  {
    title: "8. Privacidade e contato",
    body: [
      "O tratamento de dados pessoais é realizado conforme a Política de Privacidade aplicável e a legislação brasileira. Não envie dados pessoais de compradores ou terceiros além do necessário para usar o serviço e cumprir suas obrigações legais.",
      "Para dúvidas sobre estes termos, utilize os canais de suporte disponibilizados na plataforma.",
    ],
  },
];

function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0d0b16] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10 flex items-center justify-between gap-4 border-b border-white/10 pb-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar para a Pitch AI
          </Link>
          <Link to="/" aria-label="Pitch AI" className="font-semibold tracking-tight text-white">
            Pitch <span className="text-[#f97316]">AI</span>
          </Link>
        </header>

        <section className="mb-10 rounded-3xl border border-[#8b5cf6]/25 bg-[#171326] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-10">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#8b5cf6]/15 text-[#c4b5fd]">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c4b5fd]">Documento vigente</p>
          <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-5xl">Termos de Uso</h1>
          <p className="mt-4 max-w-2xl text-pretty text-base leading-7 text-white/60">
            Regras claras para usar a Pitch AI em suas operações de live commerce. Última atualização: 13 de agosto de 2026.
          </p>
        </section>

        <article className="space-y-8 rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-10">
          {sections.map((section) => (
            <section key={section.title} className="border-b border-white/8 pb-8 last:border-0 last:pb-0">
              <h2 className="text-xl font-semibold text-white sm:text-2xl">{section.title}</h2>
              <div className="mt-4 space-y-4 text-sm leading-7 text-white/65 sm:text-base">
                {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </section>
          ))}
        </article>

        <footer className="py-8 text-center text-xs text-white/40">
          Ao continuar usando a Pitch AI, você confirma que aceita estes Termos de Uso.
        </footer>
      </div>
    </main>
  );
}
