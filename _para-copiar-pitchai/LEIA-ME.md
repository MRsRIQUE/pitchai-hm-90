# Arquivos alterados — LP da Pitch AI

Três arquivos, todos dentro de `PITCHAI-HM/`. A estrutura de pastas aqui já espelha a
do projeto: dá para arrastar o conteúdo de `src/` por cima do `src/` de lá.

```
src/styles/landing-motion.css
src/routes/index.tsx
src/components/live/HeroMotion.tsx
```

> **Antes de colar por cima:** se a sua main já tem mudanças nesses três arquivos que
> não vieram desta sessão, colar substitui tudo. O `index.tsx` é o mais sensível —
> ele carrega a landing inteira. Nesse caso, aplique as alterações à mão pela lista
> abaixo, que descreve cada uma isoladamente.

---

## 1. `src/styles/landing-motion.css`

### 1.1 Botões do hero não clicavam — `.logo-reveal`

A seção do LogoReveal usa a mecânica de scrub da réplica: um miolo com `top: -100vh`
e um bloco `sticky` de 100vh dentro dele. Essa camada **sobe e cobre a metade de
baixo do hero**, bem onde fica o card de CTA. Como a section tem `z-index: 5` contra o
`z-index: 1` do hero, ela vencia o hit-test e engolia os cliques sem aparecer na tela.
O `z-index: 10` do `.hero-mega-content` não salvava: ele está preso dentro do stacking
context do hero.

Como a seção é 100% decorativa (anéis SVG, glow e o emblema — nada clicável ou
focável), ela não precisa receber ponteiro nenhum:

```css
.landing .logo-reveal {
  position: relative;
  z-index: 5;
  background: #0c0b0c;
  pointer-events: none;   /* ← adicionado */
}
```

### 1.2 A cauda do hero — nova variável e `padding-bottom`

O espaço que a faixa de métricas ocupava (249px na largura de referência) continua
existindo, só que agora pertence ao hero:

```css
.landing {
  --hero-tail: clamp(120px, 13vw, 260px);   /* ← bloco novo */
}

.landing .hero-mega {
  position: relative;
  z-index: 1;
  padding: 0 2vw var(--hero-tail);          /* ← era `padding: 0 2vw` */
  background-color: #0c0b0c;
  color: #fff;
}
```

### 1.3 Fundo cobrindo a cauda — `.hero-video-area`

O pai desse bloco deixou de ser o miolo de 100vh e passou a ser o `.hero-mega`
(ver alteração 3). Como o hero tem 2vw de padding lateral e o containing block de um
absoluto é a padding box, o `inset` precisa devolver esses 2vw — sem isso o fundo
passaria por baixo da moldura do site:

```css
.landing .hero-video-area {
  position: absolute;
  inset: 0 2vw;    /* ← era `inset: 0` */
}
```

### 1.4 O celular deixa de ser decepado — `.hero-down-mask`

Esta camada estava inerte: ficava 23.5vw **fora** do hero, invisível sob o LogoReveal.
Agora ela é o que dissolve o aparelho no preto. O aparelho é mais alto que o hero, e o
LogoReveal (z 5) vence o hero inteiro (z 1) no empilhamento — o `z-index: 12` do
aparelho é interno ao hero e não escapa, então ele era cortado numa linha reta.

O gradiente fecha em `#0c0b0c` antes do fim da cauda, e é essa mesma cor que abre o
LogoReveal: a emenda entre as duas seções não tem costura. A altura é exatamente a da
cauda — um pixel a mais e o véu já passaria por cima do card de CTA.

```css
/* ANTES                              DEPOIS */
.landing .hero-down-mask {            .landing .hero-down-mask {
  position: absolute;                   position: absolute;
  inset: auto 0 -23.5vw;                inset: auto 2vw 0;
  z-index: 3;                           z-index: 13;
  width: 100%;                          height: var(--hero-tail);
  height: 24vw;                         background-image:
  background-image:                       linear-gradient(180deg, transparent, #0c0b0c 88%);
    linear-gradient(180deg,             pointer-events: none;
      #0c0b0c, transparent);          }
  pointer-events: none;
}
```

### 1.5 Faixa de métricas — bloco removido

Saiu o bloco inteiro `FAIXA DE MÉTRICAS`, com as três regras: `.stats-band`,
`.stats-band .stats` e a `.stats-band` de dentro da media query de 860px.
As classes `.stats-grid`, `.stat`, `.stat-n`, `.stat-l` e `.stat-d` **continuam** em
`landing.css` — elas são usadas por `/lives` e `/indique`.

### 1.6 Media query `max-width: 860px`

```css
/* a cauda continua no celular, só sem o recuo lateral */
.landing .hero-mega {
  padding: 0 0 var(--hero-tail);   /* ← era `padding: 0` */
}

.landing .hero-video-area,          /* ← regra nova */
.landing .hero-down-mask {
  inset-inline: 0;
}
```

E foi **removida** desta mesma media query a regra antiga que jogava a máscara para
fora do hero e teria quebrado o esmaecimento novo:

```css
.landing .hero-down-mask {
  inset: auto 0 -32vh;
  height: 34vh;
}
```

---

## 2. `src/routes/index.tsx`

Duas remoções, nada mais.

**A constante `METRICS`** (ficava logo depois do `createFileRoute`), com os quatro
números `<2s`, `24/7`, `8` e `0`. Ela não é usada em nenhum outro lugar.

**A seção da faixa**, que ficava entre `<HeroMotion />` e `<LogoReveal />`:

```jsx
{/* métricas — saíram de dentro do hero na fusão das duas landings: ... */}
<section className="stats-band">
  <div className="wrap stats">
    <div className="stats-grid">
      {METRICS.map((m) => ( ... ))}
    </div>
  </div>
</section>
```

O `<HeroMotion />` passou a emendar direto no `<LogoReveal />`.

---

## 3. `src/components/live/HeroMotion.tsx`

Uma movimentação de JSX. O bloco `<div className="hero-video-area">` — com os dois
vídeos, a `.hero-video-mask` e o `<Particles />` — **saiu de dentro de
`<div className="hero-mega-inner">`** e virou irmão dele, filho direto do
`<header className="hero-mega">`.

É isso que faz o fundo cobrir também a cauda: as estrelas e o gradiente descem junto
com o aparelho em vez de morrerem na linha do miolo de 100vh.

O `<div className="hero-top-blur" />` **continua dentro** do miolo. A ordem final:

```jsx
<header className="hero-mega">
  <div className="hero-mega-inner">
    ... conteúdo, card de CTA, aparelho ...
    <div className="hero-top-blur" />
  </div>

  <div className="hero-video-area">...</div>   {/* ← veio de dentro do inner */}
  <div className="hero-down-mask" />
</header>
```

Nenhuma lógica de JS mudou: os effects de vídeo, o `pointY` do parallax e as variantes
de entrada continuam idênticos.

---

## Como conferir depois de colar

Com o dev server rodando (`vite dev` dentro de `PITCHAI-HM/`):

1. **Botões do hero** — clicar em "Ver planos e começar" tem que navegar para `/planos`.
   Era esse o bug do `pointer-events`.
2. **Rolar até o fim da primeira cena** — o celular precisa dissolver no preto, sem
   linha de corte reta, e as estrelas devem acompanhar até o fim da cauda.
3. **A emenda com o LogoReveal** — nenhum degrau de cor entre as duas seções.

Não consegui validar no viewport mobile: o redimensionamento da janela pela extensão
do Chrome não teve efeito aqui. O CSS de ≤860px está escrito, mas o esmaecimento no
celular não foi visto — vale um olhar quando você abrir aí.
