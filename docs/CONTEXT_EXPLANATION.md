# How React Contexts Work & Enable Background Refreshing

## 🎯 What is React Context?

React Context is a way to **share data across multiple components** without passing props through every level (prop drilling). Think of it as a **global state container** that any component can access.

### Basic Structure

```typescript
// 1. Create the Context
const MMPContext = createContext<MMPContextType>({
  mmpFiles: [],
  loading: true,
  // ... other properties
});

// 2. Create a Provider Component
export const MMPProvider = ({ children }) => {
  const [mmpFiles, setMMPFiles] = useState<MMPFile[]>([]);
  const [loading, setLoading] = useState(true);
  
  // This provider wraps your app and provides data to all children
  return (
    <MMPContext.Provider value={{ mmpFiles, loading, ... }}>
      {children}
    </MMPContext.Provider>
  );
};

// 3. Create a Hook to Use the Context
export const useMMP = () => {
  const context = useContext(MMPContext);
  if (!context) throw new Error('useMMP must be used within MMPProvider');
  return context;
};
```

---

## 🔄 How Background Refreshing Works

### The Old Way (❌ Direct Queries - No Auto-Refresh)

```typescript
// ❌ OLD APPROACH - Each component fetches its own data
function FieldOperationManager() {
  const [mmpFiles, setMmpFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Fetch data ONCE when component mounts
    const fetchData = async () => {
      const { data } = await supabase.from('mmp_files').select('*');
      setMmpFiles(data);
      setLoading(false);
    };
    fetchData();
  }, []); // Empty dependency = only runs once
  
  // ❌ Problem: If data changes in database, this component doesn't know!
  // User must manually refresh the page to see new data
}
```

**Problems:**
- ❌ Data is stale - doesn't update when database changes
- ❌ Each component makes separate queries (wasteful)
- ❌ User must manually refresh page
- ❌ Multiple components can have different data states

---

### The New Way (✅ Context + Real-time Subscriptions)

#### Step 1: Context Provider Sets Up Real-time Subscription

```typescript
// ✅ NEW APPROACH - Context provider manages data globally
export const MMPProvider = ({ children }) => {
  const [mmpFiles, setMMPFiles] = useState<MMPFile[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Function to refresh data from database
  const refreshMMPFiles = useCallback(async () => {
    setLoading(true);
    const visits = await fetchMMPFiles();
    setMMPFiles(visits);
    setLoading(false);
  }, []);
  
  // Initial data load
  useEffect(() => {
    refreshMMPFiles();
  }, [refreshMMPFiles]);
  
  // 🔥 KEY PART: Real-time Subscription
  useEffect(() => {
    // Subscribe to database changes
    const channel = supabase
      .channel('mmp_changes')
      .on(
        'postgres_changes',  // Listen for PostgreSQL changes
        { 
          event: '*',         // Listen to ALL events (INSERT, UPDATE, DELETE)
          schema: 'public', 
          table: 'mmp_files'  // Watch this table
        },
        () => {
          // 🎯 When database changes, automatically refresh!
          console.log('🔄 Database changed! Refreshing...');
          refreshMMPFiles();
        }
      )
      .subscribe();
    
    // Cleanup when component unmounts
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshMMPFiles]);
  
  return (
    <MMPContext.Provider value={{ mmpFiles, loading, refreshMMPFiles }}>
      {children}
    </MMPContext.Provider>
  );
};
```

**What happens:**
1. ✅ Context loads data once when app starts
2. ✅ Sets up a **real-time subscription** to the database
3. ✅ When **ANY** change happens in `mmp_files` table, Supabase sends a notification
4. ✅ Context automatically calls `refreshMMPFiles()` to get latest data
5. ✅ All components using this context **automatically re-render** with new data!

---

#### Step 2: Components Consume Context (No Direct Queries)

```typescript
// ✅ Component just uses context - no direct database queries!
function FieldOperationManager() {
  // Get data from context (always up-to-date!)
  const { mmpFiles, loading } = useMMP();
  
  // That's it! Data automatically updates when database changes
  // No useEffect, no manual fetching, no polling!
  
  return (
    <div>
      {loading ? 'Loading...' : mmpFiles.map(mmp => <div>{mmp.name}</div>)}
    </div>
  );
}
```

---

## 🔄 The Complete Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    DATABASE (Supabase)                       │
│                                                               │
│  ┌──────────────┐                                            │
│  │  mmp_files   │  ← Someone inserts/updates/deletes a row  │
│  └──────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
                        │
                        │ Real-time Event (WebSocket)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              MMPContext Provider (Global)                     │
│                                                               │
│  1. Receives real-time event from Supabase                   │
│  2. Calls refreshMMPFiles()                                  │
│  3. Fetches latest data from database                        │
│  4. Updates state: setMMPFiles(newData)                      │
│  5. Context value changes → triggers re-render              │
└─────────────────────────────────────────────────────────────┘
                        │
                        │ React Re-render (Automatic)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│         ALL Components Using useMMP() Hook                   │
│                                                               │
│  • FieldOperationManager  ← Gets new data automatically      │
│  • Reports                ← Gets new data automatically      │
│  • Dashboard              ← Gets new data automatically      │
│  • MMP.tsx                ← Gets new data automatically       │
│  • Any other component    ← Gets new data automatically      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Key Benefits

### 1. **Single Source of Truth**
- All components read from the **same context**
- No data inconsistencies between components
- One place to manage data logic

### 2. **Automatic Updates**
- When database changes, **all components update automatically**
- No manual refresh needed
- No polling intervals (more efficient)

### 3. **Performance**
- Data fetched **once** by context provider
- Shared across all components
- Real-time updates only when database actually changes

### 4. **Developer Experience**
- Components are simpler (no data fetching logic)
- Easy to add new components (just use the hook)
- Centralized error handling and loading states

---

## 📊 Real Example from Your Codebase

### Before (❌ Direct Query - No Auto-Refresh)

```typescript
// src/pages/FieldOperationManager.tsx (OLD)
function FieldOperationManager() {
  const [mmpFiles, setMmpFiles] = useState([]);
  
  useEffect(() => {
    // ❌ Fetches once, never updates
    const fetchData = async () => {
      const { data } = await supabase
        .from('mmp_files')
        .select('*');
      setMmpFiles(data);
    };
    fetchData();
  }, []); // Empty deps = runs once only
  
  // ❌ If another user adds an MMP, this page won't show it
  // ❌ User must refresh page manually
}
```

### After (✅ Context - Auto-Refresh)

```typescript
// src/pages/FieldOperationManager.tsx (NEW)
function FieldOperationManager() {
  // ✅ Gets data from context (always fresh!)
  const { mmpFiles, loading } = useMMP();
  
  // ✅ No useEffect needed!
  // ✅ Data automatically updates when:
  //    - Another user creates an MMP
  //    - Another user updates an MMP
  //    - Another user deletes an MMP
  //    - Any change happens in the database
  
  return <div>{/* Use mmpFiles - always up-to-date! */}</div>;
}
```

---

## 🔧 How Mutations Work

When you **change** data (create, update, delete), you should:

1. **Update the database** (via service layer)
2. **Trigger context refresh** (so all components update)

```typescript
// Example: Creating a new MMP
async function createMMP(data) {
  // 1. Insert into database
  const { data: newMMP } = await supabase
    .from('mmp_files')
    .insert(data)
    .select()
    .single();
  
  // 2. Refresh context (triggers real-time update for all components)
  await refreshMMPFiles();
  
  // ✅ Now ALL components using useMMP() will see the new MMP!
}
```

**Note:** Sometimes the real-time subscription will automatically trigger the refresh, but calling `refreshMMPFiles()` ensures immediate consistency.

---

## 🎓 Summary

| Aspect | Old Way (Direct Queries) | New Way (Context) |
|--------|-------------------------|-------------------|
| **Data Freshness** | ❌ Stale until page refresh | ✅ Always up-to-date |
| **Auto-Update** | ❌ Manual refresh needed | ✅ Automatic via real-time |
| **Performance** | ❌ Multiple queries per component | ✅ One query shared by all |
| **Code Complexity** | ❌ Each component has fetching logic | ✅ Simple hook usage |
| **Consistency** | ❌ Components can have different data | ✅ All components see same data |

---

## 🚀 The Magic Formula

```
Context Provider
  + Real-time Subscription (Supabase)
  + useCallback (stable function references)
  + useEffect (setup/cleanup)
  = Automatic Background Refreshing! ✨
```

**Result:** Your app feels **live** - data updates automatically across all pages without any user action!

