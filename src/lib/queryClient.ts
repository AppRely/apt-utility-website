import { QueryClient } from '@tanstack/react-query';

let queryClient: QueryClient | undefined;

export const getQueryClient = (): QueryClient => {
  if (!queryClient) {
    queryClient = new QueryClient();
  }
  return queryClient;
};
