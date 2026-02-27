export const GAME_TOOLS = [
    {
        type: "function",
        function: {
            name: "update_equipment",
            description: "當玩家在劇情中取得、更換或失去裝備（頭盔、服裝、鞋子、武器、飾品）時調用此工具。這會覆寫角色的絕對裝備狀態。",
            parameters: {
                type: "object",
                properties: {
                    head: { type: "string", description: "頭部裝備名稱。若卸下請傳 null或空。" },
                    body: { type: "string", description: "身體服裝或鎧甲名稱。" },
                    feet: { type: "string", description: "腳部裝備名稱，例如：皮鞋、運動鞋。" },
                    weapon: { type: "string", description: "手持武器名稱。" },
                    accessory: { type: "string", description: "飾品或配件名稱。" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "update_status",
            description: "當玩家在劇情中獲得或解除暫時性的狀態（例如中毒、受傷、隱身、力竭、著火）時調用。使用此工具來替換或新增狀態。",
            parameters: {
                type: "object",
                properties: {
                    statusEffects: {
                        type: "array",
                        items: { type: "string" },
                        description: "角色當前所有的狀態效果陣列。例如 ['中毒', '右腿殘廢']。若狀態全部解除則傳入空陣列 []。"
                    }
                },
                required: ["statusEffects"]
            }
        }
    }
];
