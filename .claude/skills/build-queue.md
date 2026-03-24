---
name: Build Queue
trigger: Whenever asked to build, fix, create, or work on any Alloro product feature
---
When triggered, fetch the Build Queue from Notion: https://www.notion.so/32dfdaf120c48141a798f219d02ac76d
Find the ACTIVE Work Order. Output it in Work Order format. Wait for 'go'. After completion, update the queue.
