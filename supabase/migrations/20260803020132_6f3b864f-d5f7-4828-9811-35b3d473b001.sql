UPDATE public.termos_consentimento SET chave = 'briefing' WHERE chave = 'briefing_nuvem';

INSERT INTO public.termos_consentimento (chave, versao, titulo, corpo, vigente)
SELECT 'metadados', 1,
       'Metadados técnicos',
       'Envio de metadados técnicos de execução (papel do agente, modelo, duração, tokens e veredito). Nunca inclui o texto do briefing nem das variações.',
       true
WHERE NOT EXISTS (SELECT 1 FROM public.termos_consentimento WHERE chave = 'metadados');