import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { listOperations, type OperationRecord } from '@/store/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export function OperationsBar() {
  const saveAs = useAppStore((s) => s.saveAs);
  const openOperation = useAppStore((s) => s.openOperation);
  const newOperation = useAppStore((s) => s.newOperation);
  const currentOpName = useAppStore((s) => s.currentOpName);
  const currentOpId = useAppStore((s) => s.currentOpId);
  const result = useAppStore((s) => s.result);
  const rules = useAppStore((s) => s.rules);

  const [nome, setNome] = useState('');
  const [ops, setOps] = useState<OperationRecord[]>([]);

  const refresh = () => listOperations().then(setOps);
  useEffect(() => {
    refresh();
  }, [result, rules, currentOpName, currentOpId]);

  const salvar = async () => {
    const n = (nome || currentOpName).trim();
    if (!n) return alert('Dê um nome à divisão.');
    await saveAs(n);
    setNome('');
    refresh();
  };

  const nova = () => {
    const salva = useAppStore.getState().currentOpId != null;
    if (salva || confirm('Voltar para a tela inicial? Esta divisão ainda não foi salva.')) newOperation();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder={currentOpName || 'nome da divisão'}
        aria-label="Nome da divisão"
        className="h-8 w-44 text-[0.8125rem]"
      />
      <Button size="sm" variant="outline" onClick={salvar}>
        Salvar
      </Button>

      <span className="mx-1 h-5 w-px bg-[var(--color-rule)]" aria-hidden />

      <Select
        aria-label="Abrir divisão salva"
        className="h-8 max-w-[13rem] text-[0.8125rem]"
        value=""
        onChange={(e) => e.target.value && openOperation(Number(e.target.value))}
      >
        <option value="">Abrir divisão…</option>
        {ops.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} · {new Date(o.updatedAt).toLocaleDateString('pt-BR')}
          </option>
        ))}
      </Select>
      <Button size="sm" variant="ghost" onClick={nova}>
        Nova
      </Button>
    </div>
  );
}
