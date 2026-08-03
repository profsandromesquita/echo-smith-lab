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
          user_id?: string
        }
        Relationships: []
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
      cancelar_solicitacao_conta: { Args: { _id: string }; Returns: boolean }
      chat_e_meu: { Args: { _chat_id: string }; Returns: boolean }
      criar_solicitacao_conta: { Args: { _tipo: string }; Returns: string }
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
          _chat_id: string
          _codigo_erro: string
          _custo: number
          _duracao_ms: number
          _etapa: string
          _modelo: string
          _provedor: string
          _status: string
          _tentativas: number
          _tipo: string
        }
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
