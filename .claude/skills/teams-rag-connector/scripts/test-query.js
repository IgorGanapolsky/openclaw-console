#!/usr/bin/env node
const { graphFetch, graphFetchAll } = require('./graph-auth');

(async () => {
  // Get Phoenix team
  const teams = await graphFetchAll('/me/joinedTeams');
  const phoenix = teams.find(t => t.displayName === 'Phoenix');
  if (!phoenix) { console.log('Phoenix team not found'); return; }
  console.log('Phoenix team ID:', phoenix.id);

  // Get channels
  const channels = await graphFetchAll('/teams/' + phoenix.id + '/channels');
  console.log('Channels:', channels.map(c => c.displayName).join(', '));

  // Get latest threads across the whole group
  const threads = await graphFetch(
    '/groups/' + phoenix.id + '/threads?$top=3&$orderby=lastDeliveredDateTime desc'
  );

  console.log('\n=== Latest Phoenix Messages ===\n');

  for (const t of (threads.value || [])) {
    const posts = await graphFetch(
      '/groups/' + phoenix.id + '/threads/' + t.id + '/posts?$top=1&$orderby=receivedDateTime desc'
    );

    for (const p of (posts.value || [])) {
      const sender = p.from?.emailAddress?.name || 'Unknown';
      const date = p.receivedDateTime;
      const text = (p.body?.content || '')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
        .slice(0, 300);

      console.log('From:', sender);
      console.log('Date:', date);
      console.log('Topic:', t.topic || '(no topic)');
      console.log('Text:', text || '(empty)');
      console.log('---');
    }
  }
})().catch(e => console.error('Failed:', e.message));
