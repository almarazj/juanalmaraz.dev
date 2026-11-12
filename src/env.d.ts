declare namespace App {
  interface Locals {
    /** Set by the middleware on every /admin request that passed requireAdmin. */
    adminEmail?: string;
  }
}
