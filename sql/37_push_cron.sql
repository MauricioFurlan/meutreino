-- Chama a Edge Function send-push a cada 15 minutos.
-- A função decide sozinha quem está na hora (horário escolhido pelo aluno,
-- alerta de sequência às 20h) e marca o dia como tratado.
--
-- O segredo que autoriza a chamada NÃO fica neste arquivo: está no Vault do
-- Supabase com o nome 'push_cron_secret' (criado uma vez, fora do git:
--   select vault.create_secret('<segredo>', 'push_cron_secret');
-- ) e é o mesmo valor do secret PUSH_CRON_SECRET da função.
--
-- cron.schedule com um nome que já existe só atualiza o job.

select cron.schedule(
  'send-push-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://qslvwyhpamazoqhcmqan.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
