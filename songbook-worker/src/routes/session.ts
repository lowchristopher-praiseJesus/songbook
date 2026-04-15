import { Hono } from 'hono';
import type { Env } from '../types';
const session = new Hono<{ Bindings: Env }>();
export default session;
