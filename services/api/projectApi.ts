/**
 * Project REST API helpers (PostgreSQL backend).
 * Thin wrappers over ProjectsApiRepository for explicit imports (getProjects, createProject, …).
 */

import { ProjectsApiRepository } from './repositories/projectsApi';
import type { Project } from '../../types';

const repo = new ProjectsApiRepository();

export async function getProjects(): Promise<Project[]> {
  return repo.findAll();
}

export async function getProject(id: string): Promise<Project | null> {
  return repo.findById(id);
}

export async function createProject(data: Partial<Project>): Promise<Project> {
  return repo.create(data);
}

export async function updateProject(id: string, data: Partial<Project>): Promise<Project> {
  return repo.update(id, data);
}

export async function deleteProject(id: string): Promise<void> {
  return repo.delete(id);
}
