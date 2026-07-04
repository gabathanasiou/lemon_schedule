export default async function(page) {
  const projectId = 'test-proj-1';
  const project = {
    id: projectId,
    title: 'Test Project',
    scenes: [
      { id: 's1', sceneNumber: '1', pageCount: 1, pageCountDecimal: 1, intExt: 'INT', set: 'Living Room', dayNight: 'DAY', description: 'First scene', cast: '1, 2' },
      { id: 's2', sceneNumber: '2', pageCount: 1, pageCountDecimal: 0.5, intExt: 'EXT', set: 'Park', dayNight: 'NIGHT', description: 'Second scene', cast: '1' },
      { id: 's3', sceneNumber: '3', pageCount: 2, pageCountDecimal: 2, intExt: 'INT', set: 'Office', dayNight: 'DAY', description: 'Third scene', cast: '2,3' },
    ],
    castMembers: [
      { id: '1', name: 'John Smith' },
      { id: '2', name: 'Jane Doe' },
      { id: '3', name: 'Bob Wilson' },
    ],
    versions: [{
      id: 'v1', name: 'v01',
      rows: [
        { id: 'r1', type: 'SCENE', sceneId: 's1', shootDay: 1, order: 0, estimatedDuration: 30 },
        { id: 'r2', type: 'SCENE', sceneId: 's2', shootDay: 1, order: 1, estimatedDuration: 45 },
        { id: 'r3', type: 'BREAK', sceneId: null, shootDay: 1, order: 2, breakDuration: 30, breakLabel: 'LUNCH' },
        { id: 'r4', type: 'SCENE', sceneId: 's3', shootDay: 1, order: 3, estimatedDuration: 60 },
      ],
      dayMeta: { '1': { date: '2026-07-15', unitCall: '08:00', status: 'work' } },
    }],
    activeVersionId: 'v1',
    ribbonDesigns: [],
    rules: [],
  };
  await page.evaluate(({pid, p}) => {
    localStorage.setItem('lemon_schedule_project_v1_' + pid, JSON.stringify(p));
    const index = JSON.parse(localStorage.getItem('lemon_schedule_project_index') || '[]');
    index.push({ id: pid, title: p.title, updatedAt: Date.now() });
    localStorage.setItem('lemon_schedule_project_index', JSON.stringify(index));
  }, {pid: projectId, p: project});
  await page.goto('http://localhost:3000/lemon_schedule/');
}
