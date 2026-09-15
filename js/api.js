// Fetches the main data file and returns the parsed JSON.
export async function fetchData(url) {
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        if (!data || !Array.isArray(data.interfaces) || !data.dataItemsCatalogue || !data.dataBlocksCatalogue || !data.rejectionCodesCatalogue) throw new Error('The reference file is incomplete or has an invalid format.');
        return data;
    } catch (error) {
        console.error("Could not load interface data:", error);
        return null;
    }
}
