import { useAppStore, type Tab } from '@/store/useAppStore';
import { Brand } from '@/components/Brand';
import { Ledger } from '@/components/Ledger';
import { OperationsBar } from '@/components/OperationsBar';
import { StartScreen } from '@/components/StartScreen';
import { EstoqueTab } from '@/components/tabs/EstoqueTab';
import { ImportarTab } from '@/components/tabs/ImportarTab';
import { DistribuirTab } from '@/components/tabs/DistribuirTab';
import { ResultadoTab } from '@/components/tabs/ResultadoTab';
import { SobraTab } from '@/components/tabs/SobraTab';

// O trabalho é sempre o mesmo e nesta ordem — a navegação é a trilha do ritual,
// não um menu (doc 06 · O ritual).
const PASSOS: { id: Tab; label: string }[] = [
  { id: 'estoque', label: 'Estoque' },
  { id: 'importar', label: 'Pedido do cliente' },
  { id: 'distribuir', label: 'Distribuir' },
  { id: 'resultado', label: 'Notas' },
  { id: 'sobra', label: 'Sobra' },
];

export default function App() {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const hydrated = useAppStore((s) => s.hydrated);
  const temDivisao = useAppStore((s) => s.stock.length > 0);

  // espera a hidratação para não piscar a tela inicial sobre uma divisão salva
  if (!hydrated) return null;
  if (!temDivisao) return <StartScreen />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--color-rule)] bg-[var(--color-paper)]">
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="flex flex-wrap items-center justify-between gap-4 py-3.5">
            <Brand />
            <OperationsBar />
          </div>

          <Ledger />

          <nav className="mt-4 flex flex-wrap gap-1" aria-label="Etapas da divisão">
            {PASSOS.map((p, i) => {
              const ativo = tab === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setTab(p.id)}
                  aria-current={ativo ? 'step' : undefined}
                  // peso igual nos dois estados: mudar de passo não pode
                  // deslocar a trilha em 2px
                  className={`-mb-px flex items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                    ativo
                      ? 'border-[var(--color-dock)] bg-[var(--color-dock-wash)] text-[var(--color-dock-strong)]'
                      : 'border-transparent text-[var(--color-graphite)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {/* o número ocupa a mesma caixa nos dois estados, para a
                      trilha não se mexer quando troca de passo */}
                  <span
                    className={`num flex h-5 w-5 items-center justify-center rounded-sm text-[0.6875rem] font-semibold ${
                      ativo
                        ? 'bg-[var(--color-dock)] text-white'
                        : 'text-[var(--color-graphite-light)]'
                    }`}
                  >
                    {i + 1}
                  </span>
                  {p.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 pb-20">
        {tab === 'estoque' && <EstoqueTab />}
        {tab === 'importar' && <ImportarTab />}
        {tab === 'distribuir' && <DistribuirTab />}
        {tab === 'resultado' && <ResultadoTab />}
        {tab === 'sobra' && <SobraTab />}
      </main>
    </div>
  );
}
