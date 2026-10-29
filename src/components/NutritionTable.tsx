import { useMemo, useState } from 'react';
import type { MealItem, NutrientSource } from '../db/types';
import { fmt } from '../lib/format';
import { displayDigits, KJ_PER_KCAL, NUTRIENT_META, percentDV, scaleNutrients, sumItems, TABLE_ORDER, type NutrientKey } from '../lib/nutrition';
import { MacroBar } from './charts';
import { Segmented, SourceBadge } from './ui';

const SOURCE_SHORT: Record<NutrientSource, string> = { rotulo: 'R', base: 'B', estimativa_ia: 'E', manual: 'M' };

/** Tabela nutricional completa de um conjunto de itens, com alternância porção / 100 g. */
export function NutritionTable({ items, title = 'Tabela nutricional' }: { items: MealItem[]; title?: string }) {
  const [mode, setMode] = useState<'porcao' | '100g'>('porcao');
  const totals = useMemo(() => sumItems(items), [items]);
  const grams = totals.grams;
  const values = useMemo(() => {
    if (mode === 'porcao' || !grams) return totals.values;
    return scaleNutrients(
      Object.fromEntries(TABLE_ORDER.map((k) => [k, totals.values[k] === null ? null : (totals.values[k]! / grams) * 100])) as unknown as typeof totals.values,
      100,
    );
  }, [mode, totals, grams]);

  const sourcesFor = (k: NutrientKey) => {
    const s = new Set<NutrientSource>();
    for (const it of items) if (it.per100g[k] !== null) s.add(it.source);
    return [...s];
  };
  const allSources = [...new Set(items.map((i) => i.source))];
  const anyEstimate = allSources.includes('estimativa_ia');

  return (
    <div className="card">
      <div className="card-title">
        <h2>{title}</h2>
        <Segmented label="Base de exibição" value={mode} onChange={setMode} options={[{ value: 'porcao', label: `Porção (${fmt(grams, 0)} g)` }, { value: '100g', label: 'Por 100 g' }]} />
      </div>

      <div className="stack-sm" style={{ marginBottom: 14 }}>
        <MacroBar label="Proteínas" value={values.protein} color="var(--c-protein)" hideMax max={Math.max(values.protein ?? 0, values.carbs ?? 0, values.fat ?? 0) || 1} />
        <MacroBar label="Carboidratos" value={values.carbs} color="var(--c-carbs)" hideMax max={Math.max(values.protein ?? 0, values.carbs ?? 0, values.fat ?? 0) || 1} />
        <MacroBar label="Gorduras" value={values.fat} color="var(--c-fat)" hideMax max={Math.max(values.protein ?? 0, values.carbs ?? 0, values.fat ?? 0) || 1} />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="ntable">
          <thead>
            <tr>
              <th scope="col">Nutriente</th>
              <th scope="col">Quantidade</th>
              <th scope="col">%VD*</th>
              <th scope="col" title="Origem do dado">Origem</th>
            </tr>
          </thead>
          <tbody>
            {TABLE_ORDER.map((k) => {
              const v = values[k];
              const meta = NUTRIENT_META[k];
              const missing = totals.missing[k];
              const partial = v !== null && missing > 0;
              const src = sourcesFor(k);
              const dv = mode === 'porcao' ? percentDV(k, v) : null;
              return (
                <tr key={k} className={meta.indent ? 'indent' : undefined}>
                  <td>{meta.label}</td>
                  <td className={v === null ? 'unknown' : undefined}>
                    {k === 'kcal' && v !== null
                      ? <><strong>{fmt(v, 0)} kcal</strong><br /><span className="tiny muted">{fmt(v * KJ_PER_KCAL, 0)} kJ</span></>
                      : v === null ? 'não disponível' : `${fmt(v, displayDigits(k))} ${meta.unit}`}
                    {partial ? <span className="tiny muted" title={`${missing} item(ns) sem este dado`}> (parcial)</span> : null}
                  </td>
                  <td>{dv === null ? <span className="muted">—</span> : `${dv}%`}</td>
                  <td className="tiny muted">{src.map((s) => SOURCE_SHORT[s]).join(' · ') || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="stack-sm mt">
        <div className="row-wrap">{allSources.map((s) => <SourceBadge key={s} source={s} />)}</div>
        <p className="tiny muted">
          Origem: R = rótulo do produto · B = base de composição de alimentos · E = estimativa produzida pela IA a partir da imagem · M = informado por você.
          “Não disponível” indica que não há dado confiável — nenhum valor é inventado. “Parcial” indica que algum item não tinha esse dado.
        </p>
        <p className="tiny muted">
          *%VD calculado sobre os valores diários de referência para adultos da IN ANVISA nº 75/2020 (dieta de 2.000 kcal); exibido só para nutrientes com referência e na visualização por porção.
          Seus valores diários podem ser maiores ou menores.
        </p>
        {anyEstimate ? (
          <p className="tiny" style={{ color: 'var(--warning)' }}>
            Parte dos valores é estimada a partir da foto. Peso, óleo e ingredientes ocultos não podem ser medidos com precisão por imagem.
          </p>
        ) : null}
      </div>
    </div>
  );
}
