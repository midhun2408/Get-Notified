const base64 = "CBMilwJBVV95cUxNN3A0WHloMDA3RDc5bXVlUUdMTzhUUUlUdjFyV2NXSmhtTGFuS3JUVnh5SHdlcHhVbzFMSlM0dkNaZnZoNFJRbW80WExEbWQ0NDNxRDllVFNZVzQ4ZmpVMVhwcGVTNlFmZVVDODJqdi1EOURmTUQ5MlhFUkZTTk5KSXJ4QWpTUmZkdkdEZmJMQmtnRkw5WmNlWjY1Y3VBTG5JOE9oMFE4UFZoQnJEekR6RUZhWEloeERXdkdpdVFOUThqWFRNNXFRWnIxM3ZmanJOcWdZa091cVlVVGprUjF1a1BScTVFSDE0NUplWW10MUU3NkV2UmgtTjJLWnN6QkpGSm1CSTJzZjhzMmtLOTVDbXkwcWNkU03SAZwCQVVfeXFMTUt2VEdGNFNfUlI2TXhKTktiSTNLMjhjTGk5RnpBdGlmZFpZWDlpOEVMZlZoZDREX0U0MjZHd2FkMGZBNFJjZlM2bEF6eXdyenpQNTBVT1QzUUFrTUxQc3BwZzlJaVFHRGw0c2RVdmc2NW9td0NzVVAwSWhuNjdSMkZpeEhpMV9PZURxYW5IZHJuOXhtclZSNnZmNHg3bzN4VVB4Y3BnZnl2TV9kR0VvZlU5Mm80RWRVdDRCN2YtVFE2NFJUM3BhS0tuMTRsOXJLbmI5Zl94YzRPLW4zUEVoMDFMbEFGZ2VhSENzR2UxaUJ0RGRWMmFKRGlIYWRZNmJjd0xfVmZadHhkRC1aV25jdFZoX24yb3pvVE5pbW0";

const standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');
const buffer = Buffer.from(standardBase64, 'base64');
const rawString = buffer.toString('binary');

console.log('Buffer length:', buffer.length);
console.log('Hex dump (first 200 bytes):');
console.log(buffer.slice(0, 200).toString('hex'));

// Look for common domain suffixes in raw bytes
const suffixes = ['.com', '.in', '.org', '.net', '.co.uk'];
suffixes.forEach(s => {
    const idx = rawString.indexOf(s);
    if (idx !== -1) {
        console.log(`Found suffix ${s} at index ${idx}`);
        console.log('Context around suffix:', rawString.substring(idx - 20, idx + 10));
    }
});
