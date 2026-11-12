/**
 * Erros em linguagem de quem usa o app: o que aconteceu e o que fazer.
 * O texto técnico original fica só em "ver detalhes".
 */
export interface ErroExplicado { titulo: string; acao: string; detalhe: string }

export const CONTA_LEITORA = "leitor-planilhas@gestfy-financeiro.iam.gserviceaccount.com";

export function explicarErro(e: unknown): ErroExplicado {
  const detalhe = e instanceof Error ? e.message : String(e ?? "");
  const t = (titulo: string, acao: string): ErroExplicado => ({ titulo, acao, detalhe });
  if (/GOOGLE_SERVICE_ACCOUNT|credenciais do google|invalid_grant|private key/i.test(detalhe))
    return t("A conexão com o Google não está configurada no servidor.", "Peça ao responsável técnico para conferir a chave da conta de serviço no ambiente (Vercel).");
  if (/permission|403|forbidden|sem permiss|n[aã]o tem acesso/i.test(detalhe))
    return t("O app não tem acesso a esta planilha.", `Compartilhe a planilha com ${CONTA_LEITORA} como Leitor e tente de novo.`);
  if (/unable to parse range|aba n[aã]o encontrada/i.test(detalhe))
    return t("A aba informada não existe na planilha.", "Confira o nome exato da aba na configuração do cliente (maiúsculas e espaços contam).");
  if (/not found|404|planilha n[aã]o encontrada/i.test(detalhe))
    return t("Planilha não encontrada.", "Confira o link da planilha na configuração do cliente.");
  if (/quota|rate limit|429|too many/i.test(detalhe))
    return t("O Google limitou as leituras por alguns instantes.", "Espere um minuto e tente de novo.");
  if (/fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|network|timeout/i.test(detalhe))
    return t("Não foi possível falar com o Google ou com o banco de dados.", "Confira a conexão e tente de novo em instantes.");
  if (/relation .* does not exist|column .* does not exist|schema cache/i.test(detalhe))
    return t("O banco de dados está desatualizado.", "Rode as migrações pendentes indicadas no aviso do topo da página.");
  if (/configure as fontes de vendas e despesas/i.test(detalhe))
    return t("Este cliente ainda não tem as fontes de vendas e despesas configuradas.", "Configure em Clientes e configurações → Fontes de dados e tente de novo.");
  if (/fechamento n[aã]o encontrado/i.test(detalhe))
    return t("Fechamento não encontrado.", "Ele pode ter sido removido. Volte ao painel e abra de novo.");
  return t("Algo deu errado ao montar esta tela.", "Tente de novo. Se continuar, envie o detalhe abaixo para o responsável técnico.");
}
