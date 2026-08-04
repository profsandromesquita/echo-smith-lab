export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      chats: {
        Row: {
          atualizado_em: string
          criado_em: string
          id: string
          modo_privacidade: string | null
          pasta_id: string | null
          perfil_marca_id: string | null
          titulo: string
          ultima_atividade_em: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          modo_privacidade?: string | null
          pasta_id?: string | null
          perfil_marca_id?: string | null
          titulo?: string
          ultima_atividade_em?: string
          user_id?: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          modo_privacidade?: string | null
          pasta_id?: string | null
          perfil_marca_id?: string | null
          titulo?: string
          ultima_atividade_em?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chats_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "pastas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chats_perfil_marca_id_fkey"
            columns: ["perfil_marca_id"]
            isOneToOne: false
            referencedRelation: "perfis_marca"
            referencedColumns: ["id"]
          },
        ]
      }
      consentimentos: {
        Row: {
          atualizado_em: string
          categoria: string
          criado_em: string
          escopo: string
          escopo_id: string | null
          estado: string
          etapa: string
          finalidade: string
          id: string
          provedor: string
          termos_id: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          categoria: string
          criado_em?: string
          escopo: string
          escopo_id?: string | null
          estado: string
          etapa: string
          finalidade: string
          id?: string
          provedor: string
          termos_id: string
          user_id?: string
        }
        Update: {
          atualizado_em?: string
          categoria?: string
          criado_em?: string
          escopo?: string
          escopo_id?: string | null
          estado?: string
          etapa?: string
          finalidade?: string
          id?: string
          provedor?: string
          termos_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consentimentos_termos_id_fkey"
            columns: ["termos_id"]
            isOneToOne: false
            referencedRelation: "termos_consentimento"
            referencedColumns: ["id"]
          },
        ]
      }
      consentimentos_historico: {
        Row: {
          acao: string
          categoria: string
          consentimento_id: string | null
          escopo: string
          escopo_id: string | null
          etapa: string
          finalidade: string
          id: string
          ocorrido_em: string
          origem: string
          provedor: string
          termos_id: string
          termos_versao: number
          user_id: string
        }
        Insert: {
          acao: string
          categoria: string
          consentimento_id?: string | null
          escopo: string
          escopo_id?: string | null
          etapa: string
          finalidade: string
          id?: string
          ocorrido_em?: string
          origem: string
          provedor: string
          termos_id: string
          termos_versao: number
          user_id?: string
        }
        Update: {
          acao?: string
          categoria?: string
          consentimento_id?: string | null
          escopo?: string
          escopo_id?: string | null
          etapa?: string
          finalidade?: string
          id?: string
          ocorrido_em?: string
          origem?: string
          provedor?: string
          termos_id?: string
          termos_versao?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consentimentos_historico_termos_id_fkey"
            columns: ["termos_id"]
            isOneToOne: false
            referencedRelation: "termos_consentimento"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_tecnicos: {
        Row: {
          chat_id: string | null
          codigo_erro: string | null
          criado_em: string
          custo_estimado: number | null
          duracao_ms: number | null
          etapa: string | null
          id: string
          modelo: string | null
          provedor: string | null
          status: string
          tentativas: number
          tipo: string
          tokens_entrada: number
          tokens_saida: number
          user_id: string
        }
        Insert: {
          chat_id?: string | null
          codigo_erro?: string | null
          criado_em?: string
          custo_estimado?: number | null
          duracao_ms?: number | null
          etapa?: string | null
          id?: string
          modelo?: string | null
          provedor?: string | null
          status: string
          tentativas?: number
          tipo: string
          tokens_entrada?: number
          tokens_saida?: number
          user_id?: string
        }
        Update: {
          chat_id?: string | null
          codigo_erro?: string | null
          criado_em?: string
          custo_estimado?: number | null
          duracao_ms?: number | null
          etapa?: string | null
          id?: string
          modelo?: string | null
          provedor?: string | null
          status?: string
          tentativas?: number
          tipo?: string
          tokens_entrada?: number
          tokens_saida?: number
          user_id?: string
        }
        Relationships: []
      }
      execucao_etapas: {
        Row: {
          backoff_base_ms: number
          categoria_requerida: string | null
          criado_em: string
          depende_de: string[]
          duracao_ms: number | null
          entrada_resumo: Json
          estado: string
          execucao_id: string
          id: string
          lease_ate: string | null
          lease_token: string | null
          ordem: number
          papel: string
          proxima_tentativa_em: string | null
          registry_versao_id: string
          tentativas: number
          tentativas_limite: number
          timeout_ms: number
          ultimo_codigo_erro: string | null
        }
        Insert: {
          backoff_base_ms?: number
          categoria_requerida?: string | null
          criado_em?: string
          depende_de?: string[]
          duracao_ms?: number | null
          entrada_resumo?: Json
          estado?: string
          execucao_id: string
          id?: string
          lease_ate?: string | null
          lease_token?: string | null
          ordem: number
          papel: string
          proxima_tentativa_em?: string | null
          registry_versao_id: string
          tentativas?: number
          tentativas_limite?: number
          timeout_ms?: number
          ultimo_codigo_erro?: string | null
        }
        Update: {
          backoff_base_ms?: number
          categoria_requerida?: string | null
          criado_em?: string
          depende_de?: string[]
          duracao_ms?: number | null
          entrada_resumo?: Json
          estado?: string
          execucao_id?: string
          id?: string
          lease_ate?: string | null
          lease_token?: string | null
          ordem?: number
          papel?: string
          proxima_tentativa_em?: string | null
          registry_versao_id?: string
          tentativas?: number
          tentativas_limite?: number
          timeout_ms?: number
          ultimo_codigo_erro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execucao_etapas_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "execucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execucao_etapas_registry_versao_id_fkey"
            columns: ["registry_versao_id"]
            isOneToOne: false
            referencedRelation: "registry_versoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execucao_etapas_versao_fkey"
            columns: ["execucao_id", "papel", "registry_versao_id"]
            isOneToOne: false
            referencedRelation: "execucao_registry_versoes"
            referencedColumns: ["execucao_id", "papel", "registry_versao_id"]
          },
        ]
      }
      execucao_eventos: {
        Row: {
          de: string | null
          etapa_id: string | null
          execucao_id: string
          id: string
          motivo: string | null
          ocorrido_em: string
          para: string
        }
        Insert: {
          de?: string | null
          etapa_id?: string | null
          execucao_id: string
          id?: string
          motivo?: string | null
          ocorrido_em?: string
          para: string
        }
        Update: {
          de?: string | null
          etapa_id?: string | null
          execucao_id?: string
          id?: string
          motivo?: string | null
          ocorrido_em?: string
          para?: string
        }
        Relationships: [
          {
            foreignKeyName: "execucao_eventos_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "execucao_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execucao_eventos_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "execucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      execucao_fotografias: {
        Row: {
          criada_em: string
          execucao_id: string | null
          id: string
          modo_privacidade: string
          user_id: string
        }
        Insert: {
          criada_em?: string
          execucao_id?: string | null
          id?: string
          modo_privacidade: string
          user_id?: string
        }
        Update: {
          criada_em?: string
          execucao_id?: string | null
          id?: string
          modo_privacidade?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execucao_fotografias_execucao_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "execucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      execucao_registry_versoes: {
        Row: {
          criado_em: string
          execucao_id: string
          id: string
          papel: string
          registry_versao_id: string
        }
        Insert: {
          criado_em?: string
          execucao_id: string
          id?: string
          papel: string
          registry_versao_id: string
        }
        Update: {
          criado_em?: string
          execucao_id?: string
          id?: string
          papel?: string
          registry_versao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execucao_registry_versoes_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "execucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execucao_registry_versoes_registry_versao_id_fkey"
            columns: ["registry_versao_id"]
            isOneToOne: false
            referencedRelation: "registry_versoes"
            referencedColumns: ["id"]
          },
        ]
      }
      execucao_reservas_custo: {
        Row: {
          chave: string
          criado_em: string
          custo_real: number | null
          custo_reservado: number
          etapa_id: string | null
          execucao_id: string
          id: string
        }
        Insert: {
          chave: string
          criado_em?: string
          custo_real?: number | null
          custo_reservado: number
          etapa_id?: string | null
          execucao_id: string
          id?: string
        }
        Update: {
          chave?: string
          criado_em?: string
          custo_real?: number | null
          custo_reservado?: number
          etapa_id?: string | null
          execucao_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execucao_reservas_custo_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "execucao_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execucao_reservas_custo_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "execucoes"
            referencedColumns: ["id"]
          },
        ]
      }
      execucao_resultados: {
        Row: {
          aprovado: boolean | null
          criado_em: string
          etapa_id: string
          id: string
          nota_final: number | null
          payload: Json
          tipo: string
          versao: string
        }
        Insert: {
          aprovado?: boolean | null
          criado_em?: string
          etapa_id: string
          id?: string
          nota_final?: number | null
          payload?: Json
          tipo: string
          versao?: string
        }
        Update: {
          aprovado?: boolean | null
          criado_em?: string
          etapa_id?: string
          id?: string
          nota_final?: number | null
          payload?: Json
          tipo?: string
          versao?: string
        }
        Relationships: [
          {
            foreignKeyName: "execucao_resultados_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "execucao_etapas"
            referencedColumns: ["id"]
          },
        ]
      }
      execucao_tentativas: {
        Row: {
          codigo_erro: string | null
          encerrada_em: string | null
          etapa_id: string
          id: string
          iniciada_em: string
          lease_token: string | null
          numero: number
          status: string
        }
        Insert: {
          codigo_erro?: string | null
          encerrada_em?: string | null
          etapa_id: string
          id?: string
          iniciada_em?: string
          lease_token?: string | null
          numero: number
          status?: string
        }
        Update: {
          codigo_erro?: string | null
          encerrada_em?: string | null
          etapa_id?: string
          id?: string
          iniciada_em?: string
          lease_token?: string | null
          numero?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "execucao_tentativas_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "execucao_etapas"
            referencedColumns: ["id"]
          },
        ]
      }
      execucoes: {
        Row: {
          cancelamento_solicitado_em: string | null
          chat_id: string | null
          criada_em: string
          custo_estimado: number
          custo_real: number | null
          estado: string
          finalizada_em: string | null
          formato_solicitado: string
          fotografia_id: string | null
          id: string
          iniciada_em: string | null
          motivo_falha: string | null
          snapshot_chat: Json
          snapshot_marca: Json
          snapshot_privacidade: Json
          snapshot_registry: Json
          user_id: string
        }
        Insert: {
          cancelamento_solicitado_em?: string | null
          chat_id?: string | null
          criada_em?: string
          custo_estimado?: number
          custo_real?: number | null
          estado?: string
          finalizada_em?: string | null
          formato_solicitado: string
          fotografia_id?: string | null
          id?: string
          iniciada_em?: string | null
          motivo_falha?: string | null
          snapshot_chat?: Json
          snapshot_marca?: Json
          snapshot_privacidade?: Json
          snapshot_registry?: Json
          user_id?: string
        }
        Update: {
          cancelamento_solicitado_em?: string | null
          chat_id?: string | null
          criada_em?: string
          custo_estimado?: number
          custo_real?: number | null
          estado?: string
          finalizada_em?: string | null
          formato_solicitado?: string
          fotografia_id?: string | null
          id?: string
          iniciada_em?: string | null
          motivo_falha?: string | null
          snapshot_chat?: Json
          snapshot_marca?: Json
          snapshot_privacidade?: Json
          snapshot_registry?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execucoes_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execucoes_fotografia_id_fkey"
            columns: ["fotografia_id"]
            isOneToOne: false
            referencedRelation: "execucao_fotografias"
            referencedColumns: ["id"]
          },
        ]
      }
      exemplos_marca: {
        Row: {
          atualizado_em: string
          criado_em: string
          id: string
          perfil_id: string
          texto: string
          titulo: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          perfil_id: string
          texto: string
          titulo?: string
          user_id?: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          perfil_id?: string
          texto?: string
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exemplos_marca_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_marca"
            referencedColumns: ["id"]
          },
        ]
      }
      fotografias_consentimento: {
        Row: {
          categoria: string
          criado_em: string
          decisao: string
          etapa: string
          finalidade: string
          fotografia_id: string
          id: string
          origem: string
          provedor: string
          termos_id: string
          termos_versao: number
          user_id: string
        }
        Insert: {
          categoria: string
          criado_em?: string
          decisao: string
          etapa: string
          finalidade: string
          fotografia_id: string
          id?: string
          origem: string
          provedor: string
          termos_id: string
          termos_versao: number
          user_id?: string
        }
        Update: {
          categoria?: string
          criado_em?: string
          decisao?: string
          etapa?: string
          finalidade?: string
          fotografia_id?: string
          id?: string
          origem?: string
          provedor?: string
          termos_id?: string
          termos_versao?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fotografias_consentimento_pai_fkey"
            columns: ["fotografia_id"]
            isOneToOne: false
            referencedRelation: "execucao_fotografias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fotografias_consentimento_termos_id_fkey"
            columns: ["termos_id"]
            isOneToOne: false
            referencedRelation: "termos_consentimento"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens: {
        Row: {
          autor: string
          chat_id: string
          criado_em: string
          id: string
          texto: string
          user_id: string
        }
        Insert: {
          autor: string
          chat_id: string
          criado_em?: string
          id?: string
          texto: string
          user_id?: string
        }
        Update: {
          autor?: string
          chat_id?: string
          criado_em?: string
          id?: string
          texto?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      pastas: {
        Row: {
          atualizado_em: string
          criado_em: string
          id: string
          nome: string
          perfil_marca_id: string | null
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome: string
          perfil_marca_id?: string | null
          user_id?: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome?: string
          perfil_marca_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pastas_perfil_marca_id_fkey"
            columns: ["perfil_marca_id"]
            isOneToOne: false
            referencedRelation: "perfis_marca"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis_marca: {
        Row: {
          atualizado_em: string
          criado_em: string
          descricao: string
          evitadas: string[]
          id: string
          nome: string
          orientacoes: string
          padrao: boolean
          personalidade: string
          posicionamento: string
          preferidas: string[]
          principios: string
          publico: string
          tom_de_voz: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          descricao?: string
          evitadas?: string[]
          id?: string
          nome: string
          orientacoes?: string
          padrao?: boolean
          personalidade?: string
          posicionamento?: string
          preferidas?: string[]
          principios?: string
          publico?: string
          tom_de_voz?: string
          user_id?: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          descricao?: string
          evitadas?: string[]
          id?: string
          nome?: string
          orientacoes?: string
          padrao?: boolean
          personalidade?: string
          posicionamento?: string
          preferidas?: string[]
          principios?: string
          publico?: string
          tom_de_voz?: string
          user_id?: string
        }
        Relationships: []
      }
      precos_modelos: {
        Row: {
          atualizado_em: string
          criado_em: string
          entrada_por_milhao: number
          id: string
          margem: number
          modelo: string
          provedor: string
          saida_por_milhao: number
          vigente: boolean
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          entrada_por_milhao?: number
          id?: string
          margem?: number
          modelo: string
          provedor: string
          saida_por_milhao?: number
          vigente?: boolean
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          entrada_por_milhao?: number
          id?: string
          margem?: number
          modelo?: string
          provedor?: string
          saida_por_milhao?: number
          vigente?: boolean
        }
        Relationships: []
      }
      preferencias_privacidade: {
        Row: {
          alerta_dados_pessoais: boolean
          atualizado_em: string
          bloquear_envio_com_alerta: boolean
          criado_em: string
          id: string
          modo_padrao: string
          retencao_conteudo: string
          retencao_logs_dias: number
          user_id: string
        }
        Insert: {
          alerta_dados_pessoais?: boolean
          atualizado_em?: string
          bloquear_envio_com_alerta?: boolean
          criado_em?: string
          id?: string
          modo_padrao?: string
          retencao_conteudo?: string
          retencao_logs_dias?: number
          user_id?: string
        }
        Update: {
          alerta_dados_pessoais?: boolean
          atualizado_em?: string
          bloquear_envio_com_alerta?: boolean
          criado_em?: string
          id?: string
          modo_padrao?: string
          retencao_conteudo?: string
          retencao_logs_dias?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          criado_em: string
          id: string
          nome_exibicao: string
        }
        Insert: {
          criado_em?: string
          id: string
          nome_exibicao?: string
        }
        Update: {
          criado_em?: string
          id?: string
          nome_exibicao?: string
        }
        Relationships: []
      }
      registry_agentes: {
        Row: {
          atualizado_em: string
          criado_em: string
          descricao: string
          id: string
          nome_exibicao: string
          papel: string
          versao_publicada_id: string | null
          versao_rascunho_id: string | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          descricao?: string
          id?: string
          nome_exibicao: string
          papel: string
          versao_publicada_id?: string | null
          versao_rascunho_id?: string | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          descricao?: string
          id?: string
          nome_exibicao?: string
          papel?: string
          versao_publicada_id?: string | null
          versao_rascunho_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registry_agentes_versao_publicada_fkey"
            columns: ["versao_publicada_id"]
            isOneToOne: false
            referencedRelation: "registry_versoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registry_agentes_versao_rascunho_fkey"
            columns: ["versao_rascunho_id"]
            isOneToOne: false
            referencedRelation: "registry_versoes"
            referencedColumns: ["id"]
          },
        ]
      }
      registry_versoes: {
        Row: {
          agente_id: string
          arquivada_em: string | null
          ativo: boolean
          autor_id: string | null
          backoff_base_ms: number
          concorrencia: number
          criado_em: string
          editada_em: string
          estado: string
          fallback: Json
          id: string
          instrucoes_sistema: string
          limite_entrada: number
          limite_saida: number
          modelo: string
          motivo_alteracao: string
          observacoes: string
          orcamento_estimado: number
          parametros: Json
          provedor: string
          publicada_em: string | null
          publicada_por: string | null
          resultado_teste: Json | null
          resultado_validacao: Json | null
          schema_entrada: Json
          schema_saida: Json
          tentativas_max: number
          testada_em: string | null
          timeout_ms: number
          validada_em: string | null
          versao: number
        }
        Insert: {
          agente_id: string
          arquivada_em?: string | null
          ativo?: boolean
          autor_id?: string | null
          backoff_base_ms?: number
          concorrencia?: number
          criado_em?: string
          editada_em?: string
          estado?: string
          fallback?: Json
          id?: string
          instrucoes_sistema?: string
          limite_entrada?: number
          limite_saida?: number
          modelo?: string
          motivo_alteracao?: string
          observacoes?: string
          orcamento_estimado?: number
          parametros?: Json
          provedor?: string
          publicada_em?: string | null
          publicada_por?: string | null
          resultado_teste?: Json | null
          resultado_validacao?: Json | null
          schema_entrada?: Json
          schema_saida?: Json
          tentativas_max?: number
          testada_em?: string | null
          timeout_ms?: number
          validada_em?: string | null
          versao: number
        }
        Update: {
          agente_id?: string
          arquivada_em?: string | null
          ativo?: boolean
          autor_id?: string | null
          backoff_base_ms?: number
          concorrencia?: number
          criado_em?: string
          editada_em?: string
          estado?: string
          fallback?: Json
          id?: string
          instrucoes_sistema?: string
          limite_entrada?: number
          limite_saida?: number
          modelo?: string
          motivo_alteracao?: string
          observacoes?: string
          orcamento_estimado?: number
          parametros?: Json
          provedor?: string
          publicada_em?: string | null
          publicada_por?: string | null
          resultado_teste?: Json | null
          resultado_validacao?: Json | null
          schema_entrada?: Json
          schema_saida?: Json
          tentativas_max?: number
          testada_em?: string | null
          timeout_ms?: number
          validada_em?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "registry_versoes_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "registry_agentes"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_conta: {
        Row: {
          atualizado_em: string
          concluido_em: string | null
          confirmado_em: string | null
          criado_em: string
          estado: string
          id: string
          tipo: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          concluido_em?: string | null
          confirmado_em?: string | null
          criado_em?: string
          estado?: string
          id?: string
          tipo: string
          user_id?: string
        }
        Update: {
          atualizado_em?: string
          concluido_em?: string | null
          confirmado_em?: string | null
          criado_em?: string
          estado?: string
          id?: string
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      termos_consentimento: {
        Row: {
          chave: string
          corpo: string
          criado_em: string
          id: string
          titulo: string
          versao: number
          vigente: boolean
        }
        Insert: {
          chave: string
          corpo: string
          criado_em?: string
          id?: string
          titulo: string
          versao: number
          vigente?: boolean
        }
        Update: {
          chave?: string
          corpo?: string
          criado_em?: string
          id?: string
          titulo?: string
          versao?: number
          vigente?: boolean
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          criado_em: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aplicar_transicao_etapa: {
        Args: { _etapa_id: string; _motivo: string; _para: string }
        Returns: undefined
      }
      aplicar_transicao_execucao: {
        Args: { _execucao_id: string; _motivo: string; _para: string }
        Returns: undefined
      }
      autorizar_execucao: {
        Args: { _categorias: string[]; _execucao_id: string }
        Returns: Json
      }
      autorizar_execucao_persistente: {
        Args: { _categorias: string[]; _escopo: string; _execucao_id: string }
        Returns: Json
      }
      cancelar_execucao: { Args: { _execucao_id: string }; Returns: undefined }
      cancelar_solicitacao_conta: { Args: { _id: string }; Returns: boolean }
      chat_e_meu: { Args: { _chat_id: string }; Returns: boolean }
      concluir_etapa: {
        Args: {
          _duracao_ms: number
          _etapa_id: string
          _lease_token: string
          _parcial?: boolean
          _resultados: Json
        }
        Returns: undefined
      }
      criar_execucao: {
        Args: {
          _chat_id: string
          _formato: string
          _modo_privacidade: string
          _permissoes: Json
          _snapshot_chat: Json
          _snapshot_marca: Json
          _snapshot_privacidade: Json
        }
        Returns: string
      }
      criar_solicitacao_conta: { Args: { _tipo: string }; Returns: string }
      custo_maximo_versao: { Args: { _versao_id: string }; Returns: number }
      desbloquear_etapas: {
        Args: { _categoria: string; _execucao_id: string }
        Returns: number
      }
      etapa_e_minha: { Args: { _etapa_id: string }; Returns: boolean }
      execucao_e_minha: { Args: { _execucao_id: string }; Returns: boolean }
      falhar_etapa: {
        Args: {
          _codigo_erro: string
          _etapa_id: string
          _incerto?: boolean
          _lease_token: string
          _sem_retry?: boolean
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      pasta_e_minha: { Args: { _pasta_id: string }; Returns: boolean }
      perfil_e_meu: {
        Args: { _perfil_id: string; _user_id: string }
        Returns: boolean
      }
      pesos_ranking_da_execucao: {
        Args: { _execucao_id: string }
        Returns: Json
      }
      reconciliar_consentimento_execucao: {
        Args: { _execucao_id: string }
        Returns: number
      }
      reconciliar_custo: {
        Args: { _chave: string; _custo_real: number; _execucao_id: string }
        Returns: undefined
      }
      recuperar_etapas_expiradas: {
        Args: { _execucao_id: string }
        Returns: number
      }
      registrar_consentimento: {
        Args: {
          _categoria: string
          _decisao: string
          _escopo: string
          _escopo_id: string
          _etapa: string
          _finalidade: string
          _origem: string
          _provedor: string
        }
        Returns: string
      }
      registrar_evento_tecnico: {
        Args: {
          _chat_id?: string
          _codigo_erro?: string
          _custo?: number
          _duracao_ms: number
          _etapa: string
          _modelo: string
          _provedor: string
          _status: string
          _tentativas?: number
          _tipo: string
          _tokens_entrada?: number
          _tokens_saida?: number
        }
        Returns: undefined
      }
      registry_atualizar_rascunho: {
        Args: { _dados: Json; _versao_id: string }
        Returns: undefined
      }
      registry_criar_rascunho: {
        Args: { _base_versao_id: string; _motivo: string; _papel: string }
        Returns: string
      }
      registry_descartar_rascunho: {
        Args: { _versao_id: string }
        Returns: undefined
      }
      registry_exigir_admin: { Args: never; Returns: undefined }
      registry_publicar: {
        Args: { _motivo: string; _versao_id: string }
        Returns: undefined
      }
      registry_registrar_teste: {
        Args: { _resultado: Json; _versao_id: string }
        Returns: undefined
      }
      registry_validar: { Args: { _versao_id: string }; Returns: Json }
      reservar_custo: {
        Args: { _chave: string; _etapa_id: string; _execucao_id: string }
        Returns: boolean
      }
      reservar_etapa: {
        Args: { _execucao_id: string }
        Returns: {
          etapa_id: string
          lease_token: string
          papel: string
          tentativa: number
        }[]
      }
      resolver_resultado_incerto: {
        Args: { _etapa_id: string; _retomar: boolean }
        Returns: undefined
      }
      revogar_consentimento: {
        Args: { _id: string; _origem: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      tem_papel: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      teto_execucao: { Args: { _execucao_id: string }; Returns: number }
    }
    Enums: {
      app_role: "usuario" | "admin_tecnico"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["usuario", "admin_tecnico"],
    },
  },
} as const
