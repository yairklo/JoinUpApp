// Unit test for searchGames' where-clause composition -- prisma.game.findMany is stubbed,
// so this never touches the DB.
const { prisma, searchGames } = require('../services/gameService');

describe('searchGames: text query + map bounds', () => {
  let findMany;

  beforeEach(() => {
    findMany = jest.spyOn(prisma.game, 'findMany').mockResolvedValue([]);
  });

  afterEach(() => {
    findMany.mockRestore();
  });

  const bounds = { minLat: '31.9', maxLat: '32.2', minLng: '34.7', maxLng: '34.9' };

  // The query-specific part of finalWhere is the last AND entry (after visibility + notCancelled).
  const lastWhere = () => {
    const { where } = findMany.mock.calls[0][0];
    return where.AND[where.AND.length - 1];
  };

  test('keeps start/sport/fieldId filters alongside both OR groups', async () => {
    await searchGames({ q: 'אולם', sport: 'SOCCER', fieldId: 'f1', ...bounds }, undefined, { dedupe: false });

    const where = lastWhere();
    expect(where.start).toBeDefined();
    expect(where.sport).toBe('SOCCER');
    expect(where.fieldId).toBe('f1');
    expect(where.OR).toBeUndefined();
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0].OR.some((c) => c.title)).toBe(true);
    expect(where.AND[1].OR.some((c) => c.customLat)).toBe(true);
  });

  test('keeps the date filter when q + bounds are combined', async () => {
    await searchGames({ q: 'x', date: '2026-09-30', ...bounds }, undefined, { dedupe: false });
    expect(lastWhere().start).toBeDefined();
  });

  test('bounds only: bounds OR sits next to the scalar filters', async () => {
    await searchGames({ sport: 'BASKETBALL', ...bounds }, undefined, { dedupe: false });
    const where = lastWhere();
    expect(where.sport).toBe('BASKETBALL');
    expect(where.OR.some((c) => c.customLat)).toBe(true);
  });

  test('q only: text OR next to the scalar filters', async () => {
    await searchGames({ q: 'x', sport: 'SOCCER' }, undefined, { dedupe: false });
    const where = lastWhere();
    expect(where.sport).toBe('SOCCER');
    expect(where.start).toBeDefined();
    expect(where.OR.some((c) => c.title)).toBe(true);
  });

  test('q also matches the address (free-form location and the field address/street)', async () => {
    await searchGames({ q: 'שדרות' }, undefined, { dedupe: false });
    const or = lastWhere().OR;
    expect(or).toContainEqual({ customLocation: { contains: 'שדרות', mode: 'insensitive' } });
    expect(or).toContainEqual({ field: { location: { contains: 'שדרות', mode: 'insensitive' } } });
    expect(or).toContainEqual({ field: { street: { contains: 'שדרות', mode: 'insensitive' } } });
  });
});
