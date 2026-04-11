/** Standard offset pagination envelope from list APIs (`skip` / `limit`). */
export interface Paginated<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}
