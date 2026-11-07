export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export interface Database {
  public: {
    Tables: {
      clinicas: {
        Row: {
          id: string;
          nome: string;
          slug: string;
          tag_curta: string | null;
          google_place_id: string | null;
          ativa: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nome: string;
          slug: string;
          tag_curta?: string | null;
          google_place_id?: string | null;
          ativa?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          slug?: string;
          tag_curta?: string | null;
          google_place_id?: string | null;
          ativa?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      fontes_dados: {
        Row: {
          id: string;
          clinica_id: string;
          tipo: "pre_consulta" | "nps" | "leads" | "faturamento" | "despesa";
          sheet_id: string;
          aba_nome: string;
          coluna_data: string;
          mapeamento: Json;
          ativo: boolean;
        };
        Insert: {
          id?: string;
          clinica_id: string;
          tipo: "pre_consulta" | "nps" | "leads" | "faturamento" | "despesa";
          sheet_id: string;
          aba_nome: string;
          coluna_data: string;
          mapeamento: Json;
          ativo?: boolean;
        };
        Update: {
          id?: string;
          clinica_id?: string;
          tipo?: "pre_consulta" | "nps" | "leads";
          sheet_id?: string;
          aba_nome?: string;
          coluna_data?: string;
          mapeamento?: Json;
          ativo?: boolean;
        };
        Relationships: [];
      };
      tipos_meta: {
        Row: {
          id: string;
          nome: string;
          unidade: string;
          formato: "moeda_brl" | "numero_inteiro" | "numero_decimal" | "percentual";
          comportamento: "acumulativa" | "media";
          ordem_exibicao: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          nome: string;
          unidade: string;
          formato: "moeda_brl" | "numero_inteiro" | "numero_decimal" | "percentual";
          comportamento?: "acumulativa" | "media";
          ordem_exibicao?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          unidade?: string;
          formato?: "moeda_brl" | "numero_inteiro" | "numero_decimal" | "percentual";
          comportamento?: "acumulativa" | "media";
          ordem_exibicao?: number;
        };
        Relationships: [];
      };
      metas: {
        Row: {
          id: string;
          clinica_id: string;
          tipo_meta_id: string;
          mes: number;
          ano: number;
          valor_meta_mensal: number;
          valor_realizado: number;
          valor_realizado_semana: number;
          data_referencia: string | null;
        };
        Insert: {
          id?: string;
          clinica_id: string;
          tipo_meta_id: string;
          mes: number;
          ano: number;
          valor_meta_mensal: number;
          valor_realizado?: number;
          valor_realizado_semana?: number;
          data_referencia?: string | null;
        };
        Update: {
          id?: string;
          clinica_id?: string;
          tipo_meta_id?: string;
          mes?: number;
          ano?: number;
          valor_meta_mensal?: number;
          valor_realizado?: number;
          valor_realizado_semana?: number;
          data_referencia?: string | null;
        };
        Relationships: [];
      };
      feriados: {
        Row: {
          data: string;
          descricao: string;
          uf: string | null;
        };
        Insert: {
          data: string;
          descricao: string;
          uf?: string | null;
        };
        Update: {
          data?: string;
          descricao?: string;
          uf?: string | null;
        };
        Relationships: [];
      };
      checkpoint_indicadores: {
        Row: {
          id: string;
          clinica_id: string;
          indicador: "leads" | "fechamentos" | "nps" | "faturamento" | "despesas";
          ativo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinica_id: string;
          indicador: "leads" | "fechamentos" | "nps" | "faturamento" | "despesas";
          ativo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clinica_id?: string;
          indicador?: "leads" | "fechamentos" | "nps" | "faturamento" | "despesas";
          ativo?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      relatorios_gerados: {
        Row: {
          id: string;
          clinica_id: string;
          formato: "whatsapp_pesquisas" | "whatsapp_metas" | "imagem";
          data_inicio: string | null;
          data_fim: string | null;
          conteudo_markdown: string | null;
          dados_json: Json | null;
          gerado_em: string;
        };
        Insert: {
          id?: string;
          clinica_id: string;
          formato: "whatsapp_pesquisas" | "whatsapp_metas" | "imagem";
          data_inicio?: string | null;
          data_fim?: string | null;
          conteudo_markdown?: string | null;
          dados_json?: Json | null;
          gerado_em?: string;
        };
        Update: {
          id?: string;
          clinica_id?: string;
          formato?: "whatsapp_pesquisas" | "whatsapp_metas" | "imagem";
          data_inicio?: string | null;
          data_fim?: string | null;
          conteudo_markdown?: string | null;
          dados_json?: Json | null;
        };
        Relationships: [];
      };
      fechamento_config: {
        Row: { clinica_id: string; fontes: Json; regras: Json; equipe: Json; ficha: Json; relatorio: Json; fontes_extras: Json; atualizado_em: string };
        Insert: { clinica_id: string; fontes?: Json; regras?: Json; equipe?: Json; ficha?: Json; relatorio?: Json; fontes_extras?: Json; atualizado_em?: string };
        Update: { fontes?: Json; regras?: Json; equipe?: Json; ficha?: Json; relatorio?: Json; fontes_extras?: Json; atualizado_em?: string };
        Relationships: [];
      };
      fechamentos: {
        Row: {
          id: string;
          clinica_id: string;
          tipo: "mensal" | "quinzenal";
          inicio: string;
          fim: string;
          status: "conferencia" | "analise" | "concluido" | "enviado";
          versao: number;
          meta_ajustada: number | null;
          decisoes: Json;
          indicadores: Json | null;
          alertas: Json | null;
          calculado_em: string | null;
          criado_em: string;
          atualizado_em: string;
          texto: Json;
          acoes: Json;
          acompanhamento: Json;
          snapshot: Json | null;
          concluido_em: string | null;
          enviado_em: string | null;
        };
        Insert: {
          id?: string;
          clinica_id: string;
          tipo: "mensal" | "quinzenal";
          inicio: string;
          fim: string;
          status?: "conferencia" | "analise" | "concluido" | "enviado";
          versao?: number;
          meta_ajustada?: number | null;
          decisoes?: Json;
          texto?: Json;
          acoes?: Json;
          acompanhamento?: Json;
        };
        Update: {
          status?: "conferencia" | "analise" | "concluido" | "enviado";
          meta_ajustada?: number | null;
          decisoes?: Json;
          indicadores?: Json | null;
          alertas?: Json | null;
          calculado_em?: string | null;
          atualizado_em?: string;
          texto?: Json;
          acoes?: Json;
          acompanhamento?: Json;
          snapshot?: Json | null;
          concluido_em?: string | null;
          enviado_em?: string | null;
        };
        Relationships: [];
      };
      fechamento_metricas: {
        Row: {
          fechamento_id: string;
          clinica_id: string;
          tipo: "mensal" | "quinzenal";
          inicio: string;
          fim: string;
          versao: number;
          indicador: string;
          valor: number | null;
          comparavel: string | null;
          formato: string | null;
          criado_em: string;
        };
        Insert: {
          fechamento_id: string;
          clinica_id: string;
          tipo: "mensal" | "quinzenal";
          inicio: string;
          fim: string;
          versao?: number;
          indicador: string;
          valor?: number | null;
          comparavel?: string | null;
          formato?: string | null;
        };
        Update: {
          valor?: number | null;
          comparavel?: string | null;
          formato?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// ─── Convenience Row types ────────────────────────────────
export type Clinica = Database["public"]["Tables"]["clinicas"]["Row"];
export type ClinicaInsert = Database["public"]["Tables"]["clinicas"]["Insert"];
export type ClinicaUpdate = Database["public"]["Tables"]["clinicas"]["Update"];

export type FonteDados = Database["public"]["Tables"]["fontes_dados"]["Row"];
export type FonteDadosInsert = Database["public"]["Tables"]["fontes_dados"]["Insert"];
export type FonteDadosUpdate = Database["public"]["Tables"]["fontes_dados"]["Update"];

export type TipoMeta = Database["public"]["Tables"]["tipos_meta"]["Row"];
export type Meta = Database["public"]["Tables"]["metas"]["Row"];
export type MetaInsert = Database["public"]["Tables"]["metas"]["Insert"];
export type MetaUpdate = Database["public"]["Tables"]["metas"]["Update"];

export type Feriado = Database["public"]["Tables"]["feriados"]["Row"];

export type CheckpointIndicador =
  Database["public"]["Tables"]["checkpoint_indicadores"]["Row"];
export type CheckpointIndicadorInsert =
  Database["public"]["Tables"]["checkpoint_indicadores"]["Insert"];

export type RelatorioGerado = Database["public"]["Tables"]["relatorios_gerados"]["Row"];
export type RelatorioGeradoInsert = Database["public"]["Tables"]["relatorios_gerados"]["Insert"];

export type TipoFonte = FonteDados["tipo"];
export type NomeIndicador = CheckpointIndicador["indicador"];
export type FormatoRelatorio = RelatorioGerado["formato"];
export type FormatoMeta = TipoMeta["formato"];
export type ComportamentoMeta = TipoMeta["comportamento"];

export type FechamentoConfig = Database["public"]["Tables"]["fechamento_config"]["Row"];
export type Fechamento = Database["public"]["Tables"]["fechamentos"]["Row"];
