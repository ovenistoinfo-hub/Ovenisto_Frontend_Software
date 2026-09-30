const fs = require('fs');
let content = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

content = content.replaceAll(
    'warehouses: "warehouses",',
    'warehouses: "warehouses",\n  website: "website",'
);

content = content.replace(
    'import { WarehousesTab } from "@/components/settings/WarehousesTab";',
    'import { WarehousesTab } from "@/components/settings/WarehousesTab";\nimport { WebsiteSettingsTab } from "@/components/settings/WebsiteSettingsTab";'
);

content = content.replace(
    '<TabsTrigger value="warehouses">Warehouses</TabsTrigger>',
    '<TabsTrigger value="warehouses">Warehouses</TabsTrigger><TabsTrigger value="website">Website</TabsTrigger>'
);

content = content.replace(
    '<TabsContent value="warehouses"><WarehousesTab /></TabsContent>',
    '<TabsContent value="warehouses"><WarehousesTab /></TabsContent>\n        <TabsContent value="website"><WebsiteSettingsTab /></TabsContent>'
);

fs.writeFileSync('src/pages/Settings.tsx', content);
