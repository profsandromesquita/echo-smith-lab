update public.execucao_resultados r
set aprovado = false, nota_final = 5.5
where r.id in (
  select r2.id from public.execucao_resultados r2
  join public.execucao_etapas e on e.id = r2.etapa_id
  where e.execucao_id = '6efa696e-4058-492c-bc92-4557752351d3' and e.papel='auditor'
  order by r2.criado_em limit 2
);