const hex = 'CBMif0FVX3lxTE5wUXhXN2pWcXRUVlp6ZXZKWWVUMXZ1WUt6LVZleFdhbHRia0tHajh2UmV2R0NBMWh1cml0Q050bXlId19QajhVUG5zV0Vncnoyc3NkbjAwdnREUXhHZnNURzZ3NnV4S3NlZ3UwaThIcnJvVFFCR0s3YWQ4OHM3RjNnSFRfRWdERGdoeFE';
const data = Buffer.from(hex, 'base64');
console.log('Length:', data.length);
console.log('Hex:', data.toString('hex'));
console.log('Latin1:', data.toString('latin1'));
