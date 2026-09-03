import { useEffect, useState } from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { deleteOperation, listOperations, type OperationRecord } from '@/store/db';
import { Brand } from '@/components/Brand';
import { ImportMainoDialog } from '@/components/ImportMainoDialog';
import { formatInteger } from '@/lib/utils';

export function StartScreen() {
  const openOperation = useAppStore((s) => s.openOperation);
  const [modal, setModal] = useState(false);
  const [divisoes, setDivisoes] = useState<OperationRecord[]>([]);

  const refresh = () => listOperations().then(setDivisoes);
  useEffect(() => {
    void refresh();
  }, []);

  const excluir = async (id: number) => {
    await deleteOperation(id);
    await refresh();
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto w-full max-w-3xl px-6 py-5">
        <Brand sub={false} />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-6 pb-20">
        <div className="space-y-6">
          <div className="space-y-3">
            <h1 className="serif text-[2.5rem] leading-[1.1] text-[var(--color-ink)]">
              Divida o lote em notas,
              <br />
              sem planilha na mão.
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-[var(--color-graphite)]">
              Importe o estoque do Maino, cruze o pedido do cliente e distribua por regras. Os produtos vêm
              sempre da sua planilha — nada é pré-cadastrado, e nada sai desta máquina.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setModal(true)}
            className="group flex w-full items-center justify-between gap-4 rounded-md border border-[var(--color-rule-strong)] bg-[var(--color-surface)] px-5 py-4 text-left transition-colors hover:border-[var(--color-dock)]"
          >
            <span>
              <span className="block text-[0.9375rem] font-semibold">Iniciar nova divisão</span>
              <span className="mt-0.5 block text-xs text-[var(--color-graphite)]">
                começa importando a exportação de estoque do Maino (.xlsx / .xls)
              </span>
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-dock)] text-white transition-colors group-hover:bg-[var(--color-dock-strong)]">
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        </div>

        {divisoes.length > 0 && (
          <section className="space-y-2">
            <h2 className="label-xs">Divisões salvas nesta máquina</h2>
            <ul className="divide-y divide-[var(--color-rule)] overflow-hidden rounded-md border border-[var(--color-rule)] bg-[var(--color-surface)]">
              {divisoes.map((d) => (
                <li key={d.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => d.id != null && void openOperation(d.id)}
                    className="min-w-0 flex-1 px-4 py-3 text-left transition-colors hover:bg-[var(--color-paper)]"
                  >
                    <span className="block truncate text-sm font-medium">{d.name}</span>
                    <span className="num mt-0.5 block text-xs text-[var(--color-graphite)]">
                      {formatInteger(d.data.stock?.length ?? 0)} produto(s) · {d.data.clients?.length ?? 0}{' '}
                      cliente(s) · {new Date(d.updatedAt).toLocaleString('pt-BR')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => d.id != null && void excluir(d.id)}
                    aria-label={`Excluir a divisão ${d.name}`}
                    className="mr-2 rounded-md p-2 text-[var(--color-graphite-light)] transition-colors hover:bg-[var(--color-signal-risk-wash)] hover:text-[var(--color-signal-risk)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <ImportMainoDialog open={modal} onClose={() => setModal(false)} />
    </div>
  );
}
