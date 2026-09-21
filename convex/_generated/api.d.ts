/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as buildings from "../buildings.js";
import type * as cases_mutations from "../cases/mutations.js";
import type * as cases_number from "../cases/number.js";
import type * as cases_queries from "../cases/queries.js";
import type * as cases_stateMachine from "../cases/stateMachine.js";
import type * as dashboard from "../dashboard.js";
import type * as email_processInbound from "../email/processInbound.js";
import type * as email_queries from "../email/queries.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authorization from "../lib/authorization.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_providers_agentmail from "../lib/providers/agentmail.js";
import type * as lib_providers_svix from "../lib/providers/svix.js";
import type * as properties from "../properties.js";
import type * as units from "../units.js";
import type * as users from "../users.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  buildings: typeof buildings;
  "cases/mutations": typeof cases_mutations;
  "cases/number": typeof cases_number;
  "cases/queries": typeof cases_queries;
  "cases/stateMachine": typeof cases_stateMachine;
  dashboard: typeof dashboard;
  "email/processInbound": typeof email_processInbound;
  "email/queries": typeof email_queries;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/authorization": typeof lib_authorization;
  "lib/errors": typeof lib_errors;
  "lib/providers/agentmail": typeof lib_providers_agentmail;
  "lib/providers/svix": typeof lib_providers_svix;
  properties: typeof properties;
  units: typeof units;
  users: typeof users;
  workspace: typeof workspace;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
