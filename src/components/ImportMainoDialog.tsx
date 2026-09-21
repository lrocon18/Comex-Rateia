import { useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { importMaino, type MainoImport } from '@/io';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatCurrency4, formatInteger, formatQuantity } from '@/lib/utils';

const PREVIEW_ROWS = 10;

interface Props {
  open: boolean;
  onClose: () => void;
  /** 'nova' cria a divisão do zero; 'substituir' troca o Maino mantendo clientes e regras. */
  mode?: 'nova' | 'substituir';
}

interface Parsed extends MainoImport {
  fileName: string;
}

/** Nome do arquivo sem extensão, para sugerir o nome da divisão. */
function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim();
}

export function ImportMainoDialog({ open, onClose, mode = 'nova' }: Props) {
  const startDivision = useAppStore((s) => s.startDivision);
  const setStock = useAppStore((s) => s.setStock);
  const saveAs = useAppStore((s) => s.saveAs);

  const fileInput = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [lendo, setLendo] = useState(false);

  const reset = () => {
    setParsed(null);
    setNome('');
    setErro(null);
    setDragging(false);
    setLendo(false);
  };

  const fechar = () => {
    reset();
    onClose();
  };

  const onFile = async (file: File) => {
    setErro(null);
    setLendo(true);
    try {
      const res = await importMaino(file);
      setParsed({ ...res, fileName: file.name });
      setNome(baseName(file.name));
    } catch (e) {
      setParsed(null);
      setErro((e as Error).message);
    } finally {
      setLendo(false);
    }
  };

  const confirmar = async () => {
    if (!parsed) return;
    if (mode === 'substituir') {
      setStock(parsed.produtos, parsed.fileName);
    } else {
      startDivision(parsed.produtos, parsed.fileName);
      const n = nome.trim() || baseName(parsed.fileName) || 'divisão sem nome';
      await saveAs(n);
    }
    fechar();
  };

  const totais = parsed && {
    produtos: parsed.produtos.length,
    unidades: parsed.produtos.reduce((s, p) => s + p.estoque, 0),
    valor: parsed.produtos.reduce((s, p) => s + p.estoque * p.pu, 0),
  };
  const repetidos = parsed
    ? parsed.produtos.length - new Set(parsed.produtos.map((p) => p.codigo)).size
    : 0;

  return (
    <Dialog open={open} onClose={fechar} labelledBy="import-maino-title" className="max-w-3xl">
      <DialogHeader onClose={fechar}>
        <DialogTitle id="import-maino-title">
          {mode === 'nova' ? 'Nova divisão' : 'Substituir o Maino'}
        </DialogTitle>
        <DialogDescription>
          importe a exportação de estoque do Maino (.xlsx / .xls) — o arquivo é lido localmente, nada sai da máquina.
        </DialogDescription>
      </DialogHeader>

      <DialogContent className="space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void onFile(file);
          }}
          className={`rounded-md border border-dashed p-6 text-center transition-colors ${
            dragging
              ? 'border-[var(--color-dock)] bg-[var(--color-dock-wash)]'
              : 'border-[var(--color-rule-strong)] bg-[var(--color-paper)]'
          }`}
        >
          <Upload className="mx-auto h-5 w-5 text-[var(--color-graphite-light)]" />
          <p className="mt-2 text-sm">
            arraste a planilha do Maino aqui ou{' '}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="font-medium text-[var(--color-dock)] underline underline-offset-2"
            >
              escolha um arquivo
            </button>
          </p>
          <p className="mt-1 text-xs text-[var(--color-graphite)]">
            {lendo ? 'lendo a planilha…' : 'colunas esperadas: código, produto, quantidade e PU de saída'}
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void onFile(file);
            }}
          />
        </div>

        {erro && (
          <div className="rounded-md bg-[var(--color-signal-risk-wash)] px-3 py-2 text-sm text-[var(--color-signal-risk)]">
            {erro}
          </div>
        )}

        {parsed && totais && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-[var(--color-graphite-light)]" />
              <span className="font-medium">{parsed.fileName}</span>
            </div>

            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-[var(--color-rule)] bg-[var(--color-rule)]">
              {[
                { k: 'Produtos', v: formatInteger(totais.produtos) },
                { k: 'Unidades', v: formatQuantity(totais.unidades) },
                { k: 'Valor total', v: formatCurrency(totais.valor) },
              ].map((c) => (
                <div key={c.k} className="bg-[var(--color-surface)] px-3 py-2.5">
                  <div className="label-xs">{c.k}</div>
                  <div className="num mt-1 font-semibold">{c.v}</div>
                </div>
              ))}
            </div>

            <div className="text-xs leading-relaxed text-[var(--color-graphite)]">
              colunas lidas: <span className="code text-[var(--color-ink)]">{parsed.colunas.codigo}</span>{' '}
              (código) · <span className="code text-[var(--color-ink)]">{parsed.colunas.produto ?? '—'}</span>{' '}
              (produto) ·{' '}
              <span className="code text-[var(--color-ink)]">{parsed.colunas.quantidade}</span> (quantidade) ·{' '}
              <span className="code text-[var(--color-ink)]">{parsed.colunas.pu}</span> (PU saída)
            </div>

            {repetidos > 0 && (
              <div className="rounded-md bg-[var(--color-signal-warn-wash)] px-3 py-2 text-sm text-[var(--color-signal-warn)]">
                {repetidos} código(s) aparecem mais de uma vez na planilha — confira antes de distribuir.
              </div>
            )}

            <div className="overflow-hidden rounded-md border border-[var(--color-rule)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">PU saída</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.produtos.slice(0, PREVIEW_ROWS).map((p, i) => (
                    <TableRow key={`${p.codigo}-${i}`}>
                      <TableCell className="code">{p.codigo}</TableCell>
                      <TableCell className="max-w-[260px] truncate" title={p.produto}>
                        {p.produto}
                      </TableCell>
                      <TableCell className="num text-right">{formatQuantity(p.estoque)}</TableCell>
                      <TableCell className="num text-right text-[var(--color-graphite)]">
                        {formatCurrency4(p.pu)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsed.produtos.length > PREVIEW_ROWS && (
                <div className="border-t border-[var(--color-rule)] bg-[var(--color-paper)] px-3 py-2 text-xs text-[var(--color-graphite)]">
                  + {formatInteger(parsed.produtos.length - PREVIEW_ROWS)} produto(s) não mostrados na prévia
                </div>
              )}
            </div>

            {mode === 'nova' && (
              <div className="space-y-2">
                <Label htmlFor="nome-divisao">Nome da divisão</Label>
                <Input
                  id="nome-divisao"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="ex.: importação março"
                />
              </div>
            )}
          </div>
        )}
      </DialogContent>

      <DialogFooter>
        <Button variant="outline" onClick={fechar}>
          Cancelar
        </Button>
        <Button disabled={!parsed} onClick={() => void confirmar()}>
          {mode === 'nova' ? 'Criar divisão' : 'Substituir estoque'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
