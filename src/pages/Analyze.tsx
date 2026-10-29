import { AlertTriangle, Calculator, Camera, Check, Crop, Pencil, PlusCircle, RefreshCw, Save, ScanSearch, Search, Sparkles, Trash2, Utensils } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CameraModal, Cropper, PickButtons } from '../components/ImageCapture';
import { FoodPicker } from '../components/FoodPicker';
import { MealEditor } from '../components/MealEditor';
import { NutritionTable } from '../components/NutritionTable';
import { Alert, Button, EducationalNotice, Empty, Modal, SourceBadge, StoredImg, TextInput, useConfirm } from '../components/ui';
import { useApp, useUser } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { deleteImage, getImage, listAnalyses, saveAnalysis, saveConsent, saveImage, saveMeal, uid } from '../db/repo';
import type { AIIdentifiedItem, MealEntry, MealItem, PhotoAnalysis } from '../db/types';
import { getDB } from '../db/index';
import { nowTime, todayISO } from '../lib/date';
import { foodCatalogForAI, getBaseFood, searchFoods } from '../lib/foods';
import { fmt } from '../lib/format';
import { blobToBase64, processImage, type CropRect } from '../lib/image';
import { guessMealType, normalizeNutrients, sumItems } from '../lib/nutrition';
import { parseDecimal } from '../lib/validation';
import { AIError, analyzeFoodImage, getAIStatus, type AIStatus } from '../services/ai';

type Stage = 'pick' | 'preview' | 'crop' | 'analyzing' | 'confirm' | 'result';

interface ConfirmRow {
  key: string;
  ai?: AIIdentifiedItem;
  item: MealItem | null; // null = ainda sem alimento definido
  gramsText: string;
}

const CONF_LABEL = { alta: ['green', 'Confiança alta'], media: ['amber', 'Confiança média'], baixa: ['red', 'Confiança baixa'] } as const;

function aiToItem(ai: AIIdentifiedItem): MealItem | null {
  const grams = ai.estimatedGrams ?? 100;
  const base = ai.matchedFoodId ? getBaseFood(ai.matchedFoodId) : undefined;
  if (base) {
    return { id: uid(), foodId: base.id, name: base.name, grams, per100g: base.per100g, source: 'base', sourceLabel: base.sourceLabel };
  }
  if (ai.estimatedPer100g && Object.values(ai.estimatedPer100g).some((v) => typeof v === 'number')) {
    return {
      id: uid(), name: ai.name, grams, per100g: normalizeNutrients(ai.estimatedPer100g), source: 'estimativa_ia',
      sourceLabel: 'Estimativa da IA a partir da imagem', brand: ai.brand ?? undefined,
    };
  }
  return null;
}

export function AnalyzePage() {
  const user = useUser();
  const { consent, refresh } = useApp();
  const toast = useToast();
  const nav = useNavigate();
  const { ask, node: confirmNode } = useConfirm();

  const [stage, setStage] = useState<Stage>('pick');
  const [raw, setRaw] = useState<Blob | null>(null);
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropRect | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [hints, setHints] = useState({ portionText: '', brand: '', note: '' });
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);
  const [rows, setRows] = useState<ConfirmRow[]>([]);
  const [pickerFor, setPickerFor] = useState<{ key: string | null; query: string } | null>(null);
  const [history, setHistory] = useState<PhotoAnalysis[]>([]);
  const [editorMeal, setEditorMeal] = useState<MealEntry | null>(null);
  const [savedMealId, setSavedMealId] = useState<string | null>(null);
  const [consentModal, setConsentModal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getAIStatus().then(setStatus);
    void listAnalyses(user.id).then(setHistory);
  }, [user.id]);

  useEffect(() => () => {
    if (rawUrl) URL.revokeObjectURL(rawUrl);
  }, [rawUrl]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function onFile(f: Blob) {
    setError(null);
    if (!f.type.startsWith('image/')) return setError('Selecione um arquivo de imagem (JPG, PNG ou WEBP).');
    try {
      // Pré-processa para pré-visualização (corrige formatos grandes e gera JPEG).
      const p = await processImage(f, { maxSide: 2000, quality: 0.9 });
      setRaw(p.blob);
      setRawUrl(URL.createObjectURL(p.blob));
      setCrop(undefined);
      setPreviewUrl(URL.createObjectURL(p.blob));
      setStage('preview');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function applyCrop(c: CropRect) {
    if (!raw) return;
    setCrop(c);
    const p = await processImage(raw, { crop: c, maxSide: 2000, quality: 0.9 });
    setPreviewUrl(URL.createObjectURL(p.blob));
    setStage('preview');
  }

  function reset() {
    setStage('pick');
    setRaw(null);
    setRawUrl(null);
    setPreviewUrl(null);
    setAnalysis(null);
    setRows([]);
    setHints({ portionText: '', brand: '', note: '' });
    setSavedMealId(null);
    setError(null);
    void listAnalyses(user.id).then(setHistory);
  }

  async function storeImage() {
    if (!raw) throw new Error('Nenhuma imagem selecionada.');
    const p = await processImage(raw, { crop, maxSide: 1024, quality: 0.8 });
    return { stored: await saveImage(user.id, p.blob, p.width, p.height), blob: p.blob };
  }

  async function analyze() {
    setError(null);
    if (!consent?.aiProcessing) return setConsentModal(true);
    const st = await getAIStatus();
    setStatus(st);
    if (!st.configured) return setError(!st.online ? 'Você está offline. Registre manualmente ou tente quando estiver conectado.' : 'A análise por IA não está disponível: cole sua chave da OpenRouter em Perfil e configurações.');
    setStage('analyzing');
    let imageId: string | null = null;
    try {
      const { stored, blob } = await storeImage();
      imageId = stored.id;
      const { result, model } = await analyzeFoodImage({
        imageBase64: await blobToBase64(blob),
        mediaType: 'image/jpeg',
        hints: { portionText: hints.portionText || undefined, brand: hints.brand || undefined, note: hints.note || undefined },
        catalog: foodCatalogForAI(),
      });
      if (!result.isFood) {
        await deleteImage(stored.id);
        setStage('preview');
        return setError('Não identificamos alimentos nesta imagem. Tente outra foto, mais próxima e com boa iluminação.');
      }
      const a: PhotoAnalysis = {
        id: uid(), userId: user.id, imageId: stored.id, createdAt: Date.now(), dishName: result.dishName,
        overallConfidence: result.overallConfidence, items: result.items, uncertainties: result.uncertainties,
        totalKcalEstimate: result.totalKcalEstimate, model,
      };
      await saveAnalysis(a);
      setAnalysis(a);
      setRows(result.items.map((ai) => ({ key: uid(), ai, item: aiToItem(ai), gramsText: String(ai.estimatedGrams ?? 100) })));
      setStage('confirm');
    } catch (e) {
      if (imageId) await deleteImage(imageId).catch(() => undefined);
      setStage('preview');
      setError(e instanceof AIError ? e.message : (e as Error).message || 'Falha na análise.');
    }
  }

  /** Registro manual (sem IA), mantendo a foto. */
  async function manualWithPhoto() {
    setError(null);
    try {
      const { stored } = await storeImage();
      const a: PhotoAnalysis = {
        id: uid(), userId: user.id, imageId: stored.id, createdAt: Date.now(), dishName: 'Registro manual',
        overallConfidence: 'baixa', items: [], uncertainties: [], totalKcalEstimate: null, model: 'manual',
      };
      await saveAnalysis(a);
      setAnalysis(a);
      setRows([]);
      setStage('confirm');
      setPickerFor({ key: null, query: '' });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const confirmedItems = useMemo(() => rows.flatMap((r) => {
    if (!r.item) return [];
    const g = parseDecimal(r.gramsText);
    return [{ ...r.item, grams: g > 0 && g <= 5000 ? Math.round(g) : r.item.grams }];
  }), [rows]);
  const pending = rows.filter((r) => !r.item).length;
  const invalidGrams = rows.some((r) => { const g = parseDecimal(r.gramsText); return !(g > 0 && g <= 5000); });

  function buildMeal(): MealEntry {
    return {
      id: savedMealId ?? uid(), userId: user.id, date: todayISO(), time: nowTime(), mealType: guessMealType(),
      name: analysis?.dishName && analysis.dishName !== 'Registro manual' ? analysis.dishName : confirmedItems.map((i) => i.name).slice(0, 3).join(', '),
      items: confirmedItems, imageId: analysis?.imageId, analysisId: analysis?.id, createdAt: Date.now(), updatedAt: Date.now(),
    };
  }

  async function quickSave() {
    setSaving(true);
    try {
      const m = await saveMeal(buildMeal());
      setSavedMealId(m.id);
      toast(savedMealId ? 'Refeição atualizada.' : 'Refeição salva no diário de hoje.');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(a: PhotoAnalysis) {
    const img = await getImage(a.imageId);
    if (!img) return toast('A foto desta análise foi excluída.', 'error');
    setRaw(img.blob);
    setPreviewUrl(URL.createObjectURL(img.blob));
    setRawUrl(null);
    setAnalysis(a);
    setSavedMealId(a.savedMealId ?? null);
    const items = a.confirmedItems ?? a.items.map(aiToItem).filter((x): x is MealItem => !!x);
    setRows(items.map((it) => ({ key: uid(), item: it, gramsText: String(it.grams), ai: a.items.find((x) => x.name === it.name) })));
    setStage(a.confirmedItems ? 'result' : 'confirm');
  }

  async function deleteHistory(a: PhotoAnalysis) {
    if (!(await ask('Excluir análise?', a.savedMealId ? 'A análise será removida. A refeição salva no diário será mantida (com a foto).' : 'A análise e a foto serão excluídas deste dispositivo.', { danger: true, confirm: 'Excluir' }))) return;
    const db = await getDB();
    await db.delete('analyses', a.id);
    if (!a.savedMealId) await db.delete('images', a.imageId);
    setHistory((h) => h.filter((x) => x.id !== a.id));
    toast('Análise excluída.');
  }

  const aiReady = status?.configured;

  return (
    <div className="page stack">
      {confirmNode}
      <div className="page-header">
        <div>
          <h1>Analisar comida</h1>
          <p>Fotografe sua refeição e confirme os alimentos para ver a tabela nutricional estimada.</p>
        </div>
        {stage !== 'pick' ? <Button onClick={reset}><RefreshCw size={18} />Analisar outra comida</Button> : null}
      </div>

      {error ? <Alert kind="danger">{error}</Alert> : null}

      {stage === 'pick' ? (
        <>
          <div className="analyzer-drop stack" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void onFile(f); }}>
            <div className="brand-mark" style={{ width: 76, height: 76, borderRadius: 24, margin: '0 auto' }}><ScanSearch size={38} /></div>
            <h2>Como está o seu prato hoje?</h2>
            <p className="muted small" style={{ maxWidth: 460, margin: '0 auto' }}>Tire uma foto de cima, com boa iluminação. Você poderá recortar, informar a porção e corrigir o que a IA identificar.</p>
            <PickButtons onFile={(f) => void onFile(f)} onCamera={() => setCamera(true)} onError={setError} />
            <p className="tiny muted">Ou arraste uma imagem para cá.</p>
          </div>
          <AIStatusNotice status={status} consentAI={!!consent?.aiProcessing} onEnable={() => setConsentModal(true)} />
          <div className="card">
            <div className="card-title"><h2>Análises recentes</h2></div>
            {history.length ? history.slice(0, 12).map((a) => (
              <div key={a.id} className="list-item">
                <button type="button" className="row grow" style={{ background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', padding: 0 }} onClick={() => openHistory(a)}>
                  <div className="thumb"><StoredImg id={a.imageId} alt={a.dishName} fallback={<Utensils size={20} />} /></div>
                  <div className="grow">
                    <div className="strong truncate">{a.dishName}</div>
                    <div className="tiny muted">{new Date(a.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{a.savedMealId ? ' · salva no diário' : ''}</div>
                  </div>
                </button>
                <Button size="icon" variant="ghost" aria-label={`Excluir análise ${a.dishName}`} onClick={() => deleteHistory(a)}><Trash2 size={18} /></Button>
              </div>
            )) : <Empty icon={<Camera size={26} />} title="Nenhuma análise ainda">Suas análises ficam salvas apenas neste dispositivo.</Empty>}
          </div>
        </>
      ) : null}

      {stage === 'crop' && rawUrl ? <div className="card"><Cropper src={rawUrl} onApply={applyCrop} onCancel={() => setStage('preview')} /></div> : null}

      {stage === 'preview' && previewUrl ? (
        <div className="result-layout">
          <div className="sticky stack">
            <img src={previewUrl} alt="Pré-visualização da refeição" className="photo" style={{ maxHeight: 460 }} />
            <div className="row-wrap">
              <Button onClick={() => setStage('crop')} disabled={!rawUrl}><Crop size={18} />Cortar</Button>
              <Button onClick={reset}><Camera size={18} />Refazer foto</Button>
            </div>
          </div>
          <div className="card stack">
            <h2>Ajude a IA (opcional)</h2>
            <TextInput label="Tamanho da porção" placeholder="Ex.: 250 g, 1 prato raso, 2 unidades" value={hints.portionText} maxLength={200} onChange={(e) => setHints({ ...hints, portionText: e.target.value })}
              hint="Se você souber o peso, ele melhora muito a estimativa." />
            <TextInput label="Marca ou produto" placeholder="Ex.: iogurte da marca X" value={hints.brand} maxLength={80} onChange={(e) => setHints({ ...hints, brand: e.target.value })}
              hint="Para produtos embalados, você também poderá buscar o rótulo." />
            <TextInput label="Observação" placeholder="Ex.: frito em azeite, sem açúcar" value={hints.note} maxLength={300} onChange={(e) => setHints({ ...hints, note: e.target.value })} />
            <Button variant="primary" block onClick={analyze} disabled={!raw}><Sparkles size={18} />Analisar com IA</Button>
            {!aiReady ? <p className="tiny muted">{status && !status.online ? 'Offline: a IA está indisponível.' : 'IA não configurada no servidor.'} Você pode registrar manualmente.</p> : null}
            <Button block onClick={manualWithPhoto}><Pencil size={18} />Registrar manualmente (sem IA)</Button>
            <p className="tiny muted">Ao analisar, a foto recortada (comprimida) e as dicas acima são enviadas ao serviço de IA. Nada é enviado no registro manual.</p>
          </div>
        </div>
      ) : null}

      {stage === 'analyzing' && previewUrl ? (
        <div className="result-layout">
          <div className="scan"><img src={previewUrl} alt="Analisando" className="photo" style={{ maxHeight: 460 }} /></div>
          <div className="card stack" aria-live="polite">
            <h2>Analisando sua refeição…</h2>
            <p className="muted small">Identificando alimentos, ingredientes e porções. Isso pode levar alguns segundos.</p>
            <div className="skeleton" style={{ height: 18, width: '70%' }} />
            <div className="skeleton" style={{ height: 18, width: '50%' }} />
            <div className="skeleton" style={{ height: 18, width: '62%' }} />
          </div>
        </div>
      ) : null}

      {stage === 'confirm' && analysis ? (
        <div className="result-layout">
          <div className="sticky stack">
            {previewUrl ? <img src={previewUrl} alt={analysis.dishName} className="photo" style={{ maxHeight: 420 }} /> : <StoredImg id={analysis.imageId} alt={analysis.dishName} className="photo" />}
            {analysis.model !== 'manual' ? (
              <div className="card stack-sm">
                <div className="row between"><h3>{analysis.dishName}</h3><span className={`badge ${CONF_LABEL[analysis.overallConfidence][0]}`}>{CONF_LABEL[analysis.overallConfidence][1]}</span></div>
                {analysis.totalKcalEstimate !== null ? <p className="small muted">Estimativa inicial da IA: ~{fmt(analysis.totalKcalEstimate, 0)} kcal (antes da sua confirmação).</p> : null}
                {analysis.uncertainties.length ? (
                  <div className="alert warning"><AlertTriangle size={18} /><div className="alert-body small"><strong>Limitações desta estimativa</strong><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{analysis.uncertainties.map((u) => <li key={u}>{u}</li>)}</ul></div></div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="card stack">
            <div>
              <h2>Confirme os alimentos</h2>
              <p className="small muted">Revise cada item, ajuste as porções e corrija o que estiver errado antes de calcular.</p>
            </div>
            {rows.map((r) => (
              <div key={r.key} className="card flat stack-sm" style={{ padding: 14 }}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div className="stack-sm">
                    <strong>{r.item?.name ?? r.ai?.name}</strong>
                    <div className="row-wrap">
                      {r.ai ? <span className={`badge ${CONF_LABEL[r.ai.confidence][0]}`}>{CONF_LABEL[r.ai.confidence][1]}</span> : null}
                      {r.item ? <SourceBadge source={r.item.source} /> : <span className="badge red">Escolha o alimento</span>}
                      {r.ai?.preparation ? <span className="badge">{r.ai.preparation}</span> : null}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" aria-label="Remover item" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}><Trash2 size={18} /></Button>
                </div>
                {r.ai && (r.ai.visibleIngredients.length || r.ai.probableIngredients.length) ? (
                  <p className="tiny muted">
                    {r.ai.visibleIngredients.length ? <>Visíveis: {r.ai.visibleIngredients.join(', ')}. </> : null}
                    {r.ai.probableIngredients.length ? <>Prováveis (não confirmados): {r.ai.probableIngredients.join(', ')}.</> : null}
                  </p>
                ) : null}
                {r.ai?.portionDescription ? <p className="tiny muted">Porção estimada: {r.ai.portionDescription}</p> : null}
                {r.ai?.brand ? (
                  <Alert kind="info" title={`Marca possivelmente identificada: ${r.ai.brand}`}>
                    {r.ai.brandEvidence ? `Evidência: ${r.ai.brandEvidence}. ` : ''}Confirme buscando o rótulo do produto.
                    <div className="mt-sm"><Button size="sm" onClick={() => setPickerFor({ key: r.key, query: r.ai!.brand! })}><Search size={16} />Consultar rótulo</Button></div>
                  </Alert>
                ) : null}
                {!r.item && r.ai?.candidates?.length ? (
                  <div className="stack-sm">
                    <span className="small">A IA ficou em dúvida. Selecione o alimento:</span>
                    <div className="row-wrap">
                      {r.ai.candidates.map((c) => (
                        <button key={c} type="button" className="chip" onClick={() => {
                          const f = searchFoods(c, undefined, 1)[0];
                          if (f) setRows(rows.map((x) => (x.key === r.key ? { ...x, item: { id: uid(), foodId: f.id, name: f.name, grams: parseDecimal(x.gramsText) || 100, per100g: f.per100g, source: f.source, sourceLabel: f.sourceLabel } } : x)));
                          else setPickerFor({ key: r.key, query: c });
                        }}>{c}</button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <div className="field" style={{ width: 140 }}>
                    <label htmlFor={`g-${r.key}`}>Porção (g)</label>
                    <input id={`g-${r.key}`} className="input" inputMode="decimal" value={r.gramsText} aria-invalid={!(parseDecimal(r.gramsText) > 0) || undefined}
                      onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, gramsText: e.target.value } : x)))} />
                  </div>
                  <Button size="sm" onClick={() => setPickerFor({ key: r.key, query: r.ai?.name ?? r.item?.name ?? '' })}><Pencil size={16} />Corrigir identificação</Button>
                </div>
              </div>
            ))}
            <Button variant="soft" onClick={() => setPickerFor({ key: null, query: '' })}><PlusCircle size={18} />Adicionar alimento não identificado</Button>
            {pending ? <Alert kind="warning">{pending} item(ns) sem alimento definido não entrarão no cálculo. Escolha uma opção ou remova.</Alert> : null}
            {invalidGrams ? <Alert kind="danger">Informe porções entre 1 g e 5.000 g.</Alert> : null}
            <Button variant="primary" block disabled={!confirmedItems.length || invalidGrams} onClick={() => setStage('result')}><Calculator size={18} />Calcular nutrientes</Button>
          </div>
        </div>
      ) : null}

      {stage === 'result' && analysis ? (
        <div className="result-layout">
          <div className="sticky stack">
            {previewUrl ? <img src={previewUrl} alt={analysis.dishName} className="photo" /> : <StoredImg id={analysis.imageId} alt={analysis.dishName} className="photo" />}
            <div className="card stack-sm">
              <h2>{analysis.dishName === 'Registro manual' ? 'Sua refeição' : analysis.dishName}</h2>
              <p className="small muted">{confirmedItems.length} alimento(s) · {fmt(sumItems(confirmedItems).grams, 0)} g no total</p>
              {confirmedItems.map((i) => (
                <div key={i.id} className="row between small"><span className="truncate">{i.name}</span><span className="muted">{i.grams} g</span></div>
              ))}
              {savedMealId ? <Alert kind="success">Refeição registrada no diário. Salvar de novo apenas atualiza o mesmo registro (sem contagem dupla).</Alert> : null}
            </div>
            <div className="grid-2">
              <Button variant="primary" loading={saving} onClick={quickSave}><Save size={18} />{savedMealId ? 'Atualizar refeição' : 'Salvar refeição'}</Button>
              <Button onClick={() => setEditorMeal(buildMeal())}><Check size={18} />Adicionar ao diário</Button>
              <Button onClick={() => setStage('confirm')}><Pencil size={18} />Editar porção</Button>
              <Button onClick={() => setStage('confirm')}><Search size={18} />Corrigir identificação</Button>
            </div>
            <Button variant="soft" onClick={reset}><Camera size={18} />Analisar outra comida</Button>
          </div>
          <div className="stack">
            <NutritionTable items={confirmedItems} />
            <EducationalNotice />
          </div>
        </div>
      ) : null}

      <CameraModal open={camera} onClose={() => setCamera(false)} onCapture={(b) => void onFile(b)} />
      <FoodPicker open={!!pickerFor} initialQuery={pickerFor?.query ?? ''} onClose={() => setPickerFor(null)} userId={user.id} title="Escolher alimento"
        onPick={(item) => {
          if (pickerFor?.key) {
            setRows(rows.map((x) => (x.key === pickerFor.key ? { ...x, item, gramsText: x.ai?.estimatedGrams ? x.gramsText : String(item.grams) } : x)));
          } else {
            setRows([...rows, { key: uid(), item, gramsText: String(item.grams) }]);
          }
        }} />
      <MealEditor open={!!editorMeal} meal={editorMeal} onClose={() => setEditorMeal(null)} onSaved={(m) => { setSavedMealId(m.id); nav(`/diario?data=${m.date}`); }} />

      <Modal open={consentModal} onClose={() => setConsentModal(false)} title="Autorizar uso da IA"
        footer={<>
          <Button onClick={() => setConsentModal(false)}>Agora não</Button>
          <Button variant="primary" onClick={async () => {
            if (consent) await saveConsent({ ...consent, aiProcessing: true, acceptedAt: Date.now() });
            await refresh();
            setConsentModal(false);
            toast('Uso da IA autorizado. Você pode revogar em Privacidade e dados.');
          }}>Autorizar</Button>
        </>}>
        <div className="stack small">
          <p>Para analisar a foto, a imagem recortada e comprimida e as informações que você digitar serão enviadas ao nosso servidor e, dele, à <strong>OpenRouter</strong>, que as repassa ao provedor do modelo de IA configurado, apenas no momento da análise.</p>
          <p className="muted">Nosso servidor não armazena as fotos. Consulte a política de privacidade do provedor. Você pode revogar esta autorização a qualquer momento.</p>
          <Link to="/privacidade">Ver detalhes em Privacidade e dados</Link>
        </div>
      </Modal>
    </div>
  );
}

function AIStatusNotice({ status, consentAI, onEnable }: { status: AIStatus | null; consentAI: boolean; onEnable: () => void }) {
  if (!status) return null;
  if (!status.online) return <Alert kind="warning" title="Você está offline">A análise por IA exige internet. Você ainda pode registrar refeições manualmente no diário.</Alert>;
  if (status.needsServerUrl) return <Alert kind="info" title="Ative a IA">Cole sua chave da OpenRouter em <Link to="/perfil?secao=ia">Perfil e configurações</Link>. Enquanto isso, o registro manual com foto funciona normalmente.</Alert>;
  if (!status.serverReachable) return <Alert kind="warning" title="IA não configurada">Cole sua chave da OpenRouter em <Link to="/perfil?secao=ia">Perfil e configurações</Link> para ativar a análise por foto. Registro manual continua disponível.</Alert>;
  if (!status.configured) return <Alert kind="info" title="IA não configurada">Cole sua chave da OpenRouter em <Link to="/perfil?secao=ia">Perfil e configurações</Link> (ou defina <code>OPENROUTER_API_KEY</code> no servidor). Até lá, use o registro manual com foto.</Alert>;
  if (!consentAI) return <Alert kind="info" title="IA disponível, aguardando sua autorização">Você ainda não autorizou o envio de fotos ao serviço de IA. <button className="btn btn-sm btn-soft" style={{ marginLeft: 6 }} onClick={onEnable}>Autorizar</button></Alert>;
  return <p className="tiny muted center"><Sparkles size={12} /> IA ativa via OpenRouter ({status.model}{status.direct ? ', chave própria' : ''}). Os resultados são estimativas e devem ser revisados.</p>;
}

