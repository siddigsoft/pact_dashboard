import { SupabaseResponse } from '@/context/mmp/types';
import { Project, ProjectActivity, SubActivity, ProjectTeamMember } from '@/types/project';

// In-memory data store for mock persistence between page refreshes
const mockStorage = {
  mmp_files: JSON.parse(localStorage.getItem('mock_mmp_files') || '[]')
};

// Function to save mock data to localStorage
const saveMockData = (collection, data) => {
  mockStorage[collection] = data;
  localStorage.setItem(`mock_${collection}`, JSON.stringify(data));
};

export const mockSupabase = {
  auth: {
    signUp: async (credentials: { email: string; password: string; options?: any }) => 
      ({ data: null, error: null }),
    signInWithPassword: async (credentials: { email: string; password: string }) => 
      ({
        data: { 
          user: { 
            id: 'mock-user-id',
            email: credentials.email,
            user_metadata: { role: 'dataCollector' }  // Properly defined user_metadata with role
          },
          session: { access_token: 'mock-token' }
        }, 
        error: null 
      }),
    signOut: async () => ({ error: null }),
    updateUser: async (data: any) => ({ data: null, error: null }),
    getSession: async () => ({ 
      data: { session: { user: { 
        id: 'mock-user-id', 
        email: 'user@example.com',
        user_metadata: { role: 'dataCollector' }  // Properly defined user_metadata with role
      } } }, 
      error: null 
    }),
    onAuthStateChange: (callback: (event: string, session: any) => void) => ({
      data: { subscription: { unsubscribe: () => {} } },
      error: null
    }),
    admin: {
      createUser: async (data: any) => ({ data: { user: null }, error: null })
    }
  },
  from: (table: string) => ({
    select: (columns: string = "*") => {
      const queryBuilder = {
        eq: (column: string, value: any) => queryBuilder,
        neq: (column: string, value: any) => queryBuilder,
        gt: (column: string, value: any) => queryBuilder,
        lt: (column: string, value: any) => queryBuilder,
        gte: (column: string, value: any) => queryBuilder,
        lte: (column: string, value: any) => queryBuilder,
        like: (column: string, value: any) => queryBuilder,
        ilike: (column: string, value: any) => queryBuilder,
        is: (column: string, value: any) => queryBuilder,
        in: (column: string, values: any[]) => queryBuilder,
        contains: (value: any) => queryBuilder,
        containedBy: (value: any) => queryBuilder,
        rangeLt: (column: string, range: any) => queryBuilder,
        rangeGt: (column: string, range: any) => queryBuilder,
        rangeGte: (column: string, range: any) => queryBuilder,
        rangeLte: (column: string, range: any) => queryBuilder,
        rangeAdjacent: (column: string, range: any) => queryBuilder,
        overlaps: (column: string, value: any) => queryBuilder,
        textSearch: (column: string, query: string, options?: any) => queryBuilder,
        match: (query: any) => queryBuilder,
        not: (column: string, operator: string, value: any) => queryBuilder,
        or: (filters: string, options?: any) => queryBuilder,
        filter: (column: string, operator: string, value: any) => queryBuilder,
        order: (column: string, options?: { ascending?: boolean }) => queryBuilder,
        limit: (count: number) => queryBuilder,
        range: (from: number, to: number) => queryBuilder,
        single: () => Promise.resolve({ data: null, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (callback: any) => {
          let result = null;
          
          switch (table) {
            case 'projects':
              result = {
                data: [
                  {
                    id: 'proj-001',
                    name: 'Emergency Food Distribution',
                    projectCode: 'EFD-2025-001',
                    description: 'Distribute emergency food supplies to affected regions',
                    projectType: 'infrastructure',
                    status: 'active',
                    startDate: '2025-01-01',
                    endDate: '2025-12-31',
                    budget: {
                      total: 500000,
                      currency: 'USD',
                      allocated: 250000,
                      remaining: 250000
                    },
                    location: {
                      country: 'SD',
                      region: 'darfur',
                      state: 'north-darfur'
                    },
                    activities: []
                  },
                  {
                    id: 'proj-002',
                    name: 'Water Access Program',
                    projectCode: 'WAP-2025-001',
                    description: 'Improve water access in rural communities',
                    projectType: 'infrastructure',
                    status: 'draft',
                    startDate: '2025-03-01',
                    endDate: '2025-09-30',
                    budget: {
                      total: 350000,
                      currency: 'USD',
                      allocated: 100000,
                      remaining: 250000
                    },
                    location: {
                      country: 'SS',
                      region: 'equatoria',
                      state: 'central-equatoria'
                    },
                    activities: []
                  }
                ],
                error: null
              };
              break;
            case 'project_activities':
              result = {
                data: [
                  {
                    id: 'act-001',
                    project_id: 'proj-001',
                    name: 'Initial Assessment',
                    description: 'Conduct initial assessment of affected areas',
                    start_date: '2025-01-01',
                    end_date: '2025-01-15',
                    status: 'completed',
                    is_active: true
                  },
                  {
                    id: 'act-002',
                    project_id: 'proj-001',
                    name: 'Distribution Planning',
                    description: 'Plan distribution logistics and schedules',
                    start_date: '2025-01-16',
                    end_date: '2025-02-28',
                    status: 'inProgress',
                    is_active: true
                  }
                ],
                error: null
              };
              break;
            case 'sub_activities':
              result = {
                data: [
                  {
                    id: 'sub-001',
                    activity_id: 'act-001',
                    name: 'Site Survey',
                    status: 'completed',
                    is_active: true
                  },
                  {
                    id: 'sub-002',
                    activity_id: 'act-001',
                    name: 'Data Collection',
                    status: 'completed',
                    is_active: true
                  },
                  {
                    id: 'sub-003',
                    activity_id: 'act-002',
                    name: 'Resource Allocation',
                    status: 'completed',
                    is_active: true
                  },
                  {
                    id: 'sub-004',
                    activity_id: 'act-002',
                    name: 'Route Planning',
                    status: 'inProgress',
                    is_active: true
                  }
                ],
                error: null
              };
              break;
            case 'team_members':
              result = {
                data: [
                  {
                    id: 'team-001',
                    project_id: 'proj-001',
                    user_id: 'user-001',
                    role: 'projectManager',
                    joined_at: '2025-01-01',
                    workload: 80
                  },
                  {
                    id: 'team-002',
                    project_id: 'proj-001',
                    user_id: 'user-002',
                    role: 'fieldAssistant',
                    joined_at: '2025-01-01',
                    workload: 50
                  }
                ],
                error: null
              };
              break;
            case 'user_roles':
              result = {
                data: [
                  {
                    id: 'role-001',
                    user_id: 'user-001',
                    role: 'admin'
                  },
                  {
                    id: 'role-002',
                    user_id: 'user-002',
                    role: 'datacollector'
                  }
                ],
                error: null
              };
              break;
            case 'mmp_files':
              result = {
                data: mockStorage.mmp_files,
                error: null
              };
              break;
            default:
              result = {
                data: [],
                error: null
              };
          }
          
          return Promise.resolve(callback(result));
        },
        catch: (callback: any) => Promise.resolve(callback(null))
      };
      
      return queryBuilder as any;
    },
    insert: (data: any) => {
      const response = (collection: string, insertData: any) => {
        // Generate a unique ID
        const newId = `persistent-${Date.now()}`;
        const newItem = { ...insertData, id: newId };
        
        // Handle specific collections
        if (collection === 'mmp_files') {
          mockStorage.mmp_files = [...mockStorage.mmp_files, newItem];
          saveMockData('mmp_files', mockStorage.mmp_files);
        }
        
        return { data: newItem, error: null };
      };
      
      return Promise.resolve(response(table, data));
    },
    update: (data: any) => ({
      eq: (column: string, value: any): Promise<SupabaseResponse<any>> => 
        Promise.resolve({ data: { ...data, id: value }, error: null }),
      match: (conditions: any): Promise<SupabaseResponse<any>> => 
        Promise.resolve({ data: { ...data, ...conditions }, error: null }),
      select: () => ({
        single: () => Promise.resolve({ data: null, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (onFulfilled: any) => Promise.resolve(onFulfilled({ data: null, error: null }))
      }),
      data: null,
      error: null
    }),
    delete: () => ({
      eq: (column: string, value: any): Promise<SupabaseResponse<any>> => {
        if (table === 'mmp_files') {
          const updatedFiles = mockStorage.mmp_files.filter(item => item[column] !== value);
          saveMockData('mmp_files', updatedFiles);
        }
        return Promise.resolve({ data: { id: value }, error: null });
      },
      match: (conditions: any): Promise<SupabaseResponse<any>> => {
        return Promise.resolve({ data: conditions, error: null });
      },
      data: null,
      error: null
    })
  }),
  storage: {
    from: (bucket: string) => ({
      upload: (path: string, file: any) => Promise.resolve({ data: { path }, error: null }),
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.com/storage/${bucket}/${path}` } }),
      remove: (paths: string[]) => Promise.resolve({ data: { paths }, error: null })
    })
  }
};
