async function test() {
  const res = await fetch('https://worker.get-notified-api.workers.dev/topic/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Kerala', id: 'hpkslSylvzumvhaZxLmV' })
  });
  console.log(await res.text());
}
test();
