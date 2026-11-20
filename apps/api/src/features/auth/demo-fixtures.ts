export const demoTenants = [
  {
    id: "b809ef38-b470-46c6-ac82-af94e807ccdf",
    slug: "apex-hvac",
    name: "Apex HVAC Services",
    accounts: {
      ADMIN: { id: "669a185a-dceb-4583-abc5-8b7a57e2a16b", name: "Morgan Cruz", email: "morgan@apex.example" },
      DISPATCHER: { id: "f669c9e5-7e64-4464-af27-d1ac7359c46a", name: "Jamie Reyes", email: "jamie@apex.example" },
      TECHNICIAN: { id: "39ebba8a-c372-43bb-afc4-e285f56bd2ca", name: "Sarah Lim", email: "sarah@apex.example" },
    },
    extraTechnicians: [
      { id: "65d4d55f-822a-4da4-aad1-32ca500d4e31", name: "Marcus Tan", email: "marcus@apex.example" },
      { id: "dff0542d-330f-424f-96bc-71273fcb4a9c", name: "Rey Bautista", email: "rey@apex.example" },
    ],
  },
  {
    id: "48fd65d4-f3a6-44c5-8626-2429bfe239b4",
    slug: "metro-plumbing",
    name: "Metro Plumbing Co.",
    accounts: {
      ADMIN: { id: "3c1fc3fc-9703-411a-a2ef-a67295cd5b91", name: "Casey Ramos", email: "casey@metro.example" },
      DISPATCHER: { id: "b375dfa9-9b09-4a97-8327-54af580d7005", name: "Alex Santos", email: "alex@metro.example" },
      TECHNICIAN: { id: "9dc0877c-cb16-4002-a382-c6924a20de03", name: "Riley Flores", email: "riley@metro.example" },
    },
    extraTechnicians: [
      { id: "1254a14c-47a3-46c6-a69b-baa2f6685fbd", name: "Jordan Lee", email: "jordan@metro.example" },
      { id: "719e24cd-8182-42b2-ae3d-48831624501b", name: "Nina Garcia", email: "nina@metro.example" },
    ],
  },
] as const;
