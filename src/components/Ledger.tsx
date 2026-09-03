import { useAppStore } from '@/store/useAppStore';
import { ledgerTotals } from '@/engine';
import { cn, formatCurrency, formatInteger } from '@/lib/utils';

function Readout({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="bg-[var(--color-surface)] px-4 py-2.5">
      <div className="label-xs">{k}</div>
      <div className={cn('num mt-0.5 text-[1.0625rem] font-semibold leading-[1.3]', tone)}>{v}</div>
    </div>
  );
}

/** Painel de instrumentos da divisão: os seis números que a operadora confere. */
export function Ledger() {
  const stock = useAppStore((s) => s.stock);
  const result = useAppStore((s) => s.result);
  const clientsCount = useAppStore((s) => s.clients.length);
  const t = ledgerTotals(stock, result, clientsCount);

  const apagado = 'text-[var(--color-graphite-light)]';

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-[var(--color-rule)] bg-[var(--color-rule)] sm:grid-cols-3 lg:grid-cols-6">
      <Readout k="Produtos" v={formatInteger(t.produtos)} />
      <Readout k="Estoque inicial" v={formatInteger(t.estoqueInicial)} />
      <Readout k="Distribuído" v={formatInteger(t.distribuido)} tone={t.distribuido ? undefined : apagado} />
      <Readout
        k="Disponível"
        v={formatInteger(t.disponivel)}
        tone={t.disponivel ? 'text-[var(--color-dock)]' : apagado}
      />
      <Readout k="Valor da sobra" v={formatCurrency(t.valorSobra)} />
      <Readout k="Clientes" v={formatInteger(t.clientes)} tone={t.clientes ? undefined : apagado} />
    </div>
  );
}
