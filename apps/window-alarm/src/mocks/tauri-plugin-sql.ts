class Database {
    static async load(path: string) {
        return new Database();
    }
    async execute(query: string, args?: any[]) {
        console.log('[MOCK] SQL execute:', query, args);
        return { rowsAffected: 0, lastInsertId: 0 };
    }
    async select(query: string, args?: any[]) {
        console.log('[MOCK] SQL select:', query, args);
        return [];
    }
}
export default Database;
