/**
 * Unit REST API helpers (PostgreSQL backend).
 * Thin wrappers over UnitsApiRepository (getUnits, getUnitsByProject, …).
 */

import { UnitsApiRepository } from './repositories/unitsApi';
import type { Unit } from '../../types';

const repo = new UnitsApiRepository();

export async function getUnits(): Promise<Unit[]> {
  return repo.findAll();
}

export async function getUnitsByProject(projectId: string): Promise<Unit[]> {
  return repo.findByProjectId(projectId);
}

export async function getUnit(id: string): Promise<Unit | null> {
  return repo.findById(id);
}

export async function createUnit(data: Partial<Unit>): Promise<Unit> {
  return repo.create(data);
}

export async function updateUnit(id: string, data: Partial<Unit>): Promise<Unit> {
  return repo.update(id, data);
}

export async function deleteUnit(id: string): Promise<void> {
  return repo.delete(id);
}
