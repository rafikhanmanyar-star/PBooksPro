/**
 * Single-owner attribution helpers on top of {@link Property} ownership.
 */
import assert from 'node:assert';
import type { AppState, Property } from '../types';
import {
    getOwnershipSharesForPropertyOnDate,
    hasMultipleOwnersOnDate,
    validateOwnershipSharesTotal,
    resolveOwnerForPropertyOnDate,
} from '../services/propertyOwnershipService';

function minimalProperty(id: string, ownerId: string): Property {
    return { id, name: 'U1', ownerId, buildingId: 'b1' };
}

function baseState(): Pick<AppState, 'properties'> {
    return {
        properties: [minimalProperty('p1', 'o1')],
    };
}

{
    const st = baseState();
    const shares = getOwnershipSharesForPropertyOnDate(st, 'p1', '2024-06-15');
    assert.equal(shares.length, 1);
    assert.equal(shares[0].ownerId, 'o1');
    assert.equal(shares[0].percentage, 100);
}

{
    const st = baseState();
    assert.equal(resolveOwnerForPropertyOnDate(st, 'p1', '2024-06-15'), 'o1');
    assert.equal(hasMultipleOwnersOnDate(st, 'p1', '2024-06-15'), false);
}

{
    const err = validateOwnershipSharesTotal([
        { ownerId: 'a', percentage: 50 },
        { ownerId: 'b', percentage: 40 },
    ]);
    assert.ok(err);
}

{
    assert.equal(
        validateOwnershipSharesTotal([
            { ownerId: 'a', percentage: 50 },
            { ownerId: 'b', percentage: 50.01 },
        ]),
        null
    );
    assert.ok(
        validateOwnershipSharesTotal([
            { ownerId: 'a', percentage: 50 },
            { ownerId: 'b', percentage: 50.02 },
        ])
    );
}
