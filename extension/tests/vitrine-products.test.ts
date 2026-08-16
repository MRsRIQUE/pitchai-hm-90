import { describe, expect, it } from "vitest";
import { mergeVitrineProducts } from "../../src/lib/live/config";

describe("produtos sincronizados da vitrine", () => {
  it("entram na lista principal sem duplicar e ativam o primeiro produto", () => {
    const result = mergeVitrineProducts(
      [],
      [
        { name: "  Kit Verão  ", price: " R$ 49,90 " },
        { name: "kit verão", price: "R$ 59,90" },
        { name: "Bolsa", description: "Leve" },
      ],
    );

    expect(result.addedCount).toBe(2);
    expect(result.produtos).toHaveLength(2);
    expect(result.produtos[0]).toMatchObject({
      name: "Kit Verão",
      price: "R$ 49,90",
      active: true,
    });
    expect(result.produtos[1]).toMatchObject({ name: "Bolsa", active: false });
  });

  it("não duplica uma vitrine já importada", () => {
    const current = [
      {
        id: "produto-1",
        name: "Kit Verão",
        price: "R$ 49,90",
        description: "",
        active: true,
      },
    ];

    const result = mergeVitrineProducts(current, [{ name: " kit verão " }]);

    expect(result.addedCount).toBe(0);
    expect(result.produtos).toBe(current);
  });

  it("recupera uma configuração antiga que ficou sem produto ativo", () => {
    const result = mergeVitrineProducts(
      [
        {
          id: "produto-1",
          name: "Bolsa",
          price: "",
          description: "",
          active: false,
        },
      ],
      [],
    );

    expect(result.produtos[0].active).toBe(true);
  });
});
